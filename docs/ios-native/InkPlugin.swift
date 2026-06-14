import Foundation
import UIKit
import PencilKit
import Capacitor

/// ネイティブ PencilKit 手書きキャンバスを「Webの指定領域に重ねる」プラグイン（オーバーレイ方式）。
/// 全画面モーダルではなく、Web のキャンバス領域(rect)にだけ重ねるので、Web のサイドバー/
/// ツールバーは表示されたまま。ペンで描画、指でスクロール。
///
/// JS API:
///   Ink.show({ rect:{x,y,w,h}, pages:[{bg,w,h}], drawing? })  // 重ねて表示
///   Ink.setRect({ rect:{x,y,w,h} })                           // 位置/サイズ更新
///   Ink.hide()  -> { drawing, thumbnails }                    // 保存して撤去
///
/// 導入: ViewController.capacitorDidLoad() で bridge?.registerPluginInstance(InkPlugin())
@objc(InkPlugin)
public class InkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InkPlugin"
    public let jsName = "Ink"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
    ]

    private var overlay: InkOverlayView?

    private func parseRect(_ obj: [String: Any]?) -> CGRect {
        let x = (obj?["x"] as? NSNumber)?.doubleValue ?? 0
        let y = (obj?["y"] as? NSNumber)?.doubleValue ?? 0
        let w = (obj?["w"] as? NSNumber)?.doubleValue ?? 320
        let h = (obj?["h"] as? NSNumber)?.doubleValue ?? 480
        return CGRect(x: x, y: y, width: w, height: h)
    }

    @objc func show(_ call: CAPPluginCall) {
        let rect = parseRect(call.getObject("rect"))
        let pagesRaw = (call.getArray("pages") as? [[String: Any]]) ?? []
        var pages: [InkPage] = []
        for p in pagesRaw {
            let w = (p["w"] as? NSNumber)?.doubleValue ?? 1240
            let h = (p["h"] as? NSNumber)?.doubleValue ?? 1754
            var img: UIImage? = nil
            if let b64 = p["bg"] as? String, let data = Data(base64Encoded: b64) { img = UIImage(data: data) }
            pages.append(InkPage(w: CGFloat(w), h: CGFloat(h), bg: img))
        }
        var drawing = PKDrawing()
        if let db64 = call.getString("drawing"), let data = Data(base64Encoded: db64), let d = try? PKDrawing(data: data) { drawing = d }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let host = self.webView else { call.reject("no webView"); return }
            self.overlay?.teardown(); self.overlay?.removeFromSuperview()
            let ov = InkOverlayView(frame: rect, pages: pages, drawing: drawing)
            host.addSubview(ov)
            host.bringSubviewToFront(ov)
            self.overlay = ov
            call.resolve()
        }
    }

    @objc func setRect(_ call: CAPPluginCall) {
        let rect = parseRect(call.getObject("rect"))
        DispatchQueue.main.async { [weak self] in
            self?.overlay?.updateFrame(rect)
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            let res = self.overlay?.exportResult() ?? ["drawing": "", "thumbnails": []]
            self.overlay?.teardown()
            self.overlay?.removeFromSuperview()
            self.overlay = nil
            call.resolve(res)
        }
    }
}

/// 1ページ定義
struct InkPage { let w: CGFloat; let h: CGFloat; let bg: UIImage? }

/// 指定領域に重ねる PencilKit ビュー。
/// 構成: PKCanvasView 自身をスクロールビューとして使い（＝入力座標が常に正確）、
///       背景画像はその中に縦積みで敷く。ペンのみ描画・指でスクロール。
/// ※ ズームは入力ズレ防止のため一旦無効（min=max=1）。スクロールは有効。
class InkOverlayView: UIView {
    private var pages: [InkPage]
    private let canvasView = PKCanvasView()
    private let bgContainer = UIView()
    private var toolPicker: PKToolPicker?
    private var displayLink: CADisplayLink?
    private let pageGap: CGFloat = 0  // 隙間なしでページを隣接（つなぎ目に書ける違和感を解消）。境界は区切り線で表示
    private var pageRects: [CGRect] = []
    private var contentSizeVal: CGSize = .zero
    private var didLayout = false

    init(frame: CGRect, pages: [InkPage], drawing: PKDrawing) {
        self.pages = pages
        super.init(frame: frame)
        backgroundColor = UIColor(white: 0.93, alpha: 1.0)
        clipsToBounds = true

        canvasView.frame = bounds
        canvasView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        canvasView.alwaysBounceVertical = true
        canvasView.contentInsetAdjustmentBehavior = .never
        canvasView.minimumZoomScale = 1.0
        canvasView.maximumZoomScale = 4.0   // ピンチズーム有効（入力は PencilKit ネイティブ＝正確）
        canvasView.bouncesZoom = true
        canvasView.drawing = drawing
        if #available(iOS 14.0, *) { canvasView.drawingPolicy = .pencilOnly }
        bgContainer.layer.anchorPoint = CGPoint(x: 0, y: 0) // 左上基準で拡大（drawingと原点を合わせる）
        canvasView.insertSubview(bgContainer, at: 0) // 背景はキャンバス内（contentOffsetで一緒にスクロール）
        addSubview(canvasView)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        layoutIfNeeded()
        relayout()
        setupToolPicker()
        startBgSync()
    }

    // 背景をキャンバスのズーム倍率に毎フレーム追従させる（PencilKitのdelegateを奪わない）
    private func startBgSync() {
        displayLink?.invalidate()
        let dl = CADisplayLink(target: self, selector: #selector(syncBg))
        dl.add(to: .main, forMode: .common)
        displayLink = dl
    }
    @objc private func syncBg() {
        let s = canvasView.zoomScale
        let tr = CGAffineTransform(scaleX: s, y: s)
        if bgContainer.transform != tr { bgContainer.transform = tr }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if !didLayout && bounds.width > 0 { relayout() }
    }

    func updateFrame(_ rect: CGRect) {
        frame = rect
        didLayout = false
        relayout()
    }

    private func relayout() {
        let targetW = bounds.width
        guard targetW > 0 else { return }
        didLayout = true
        var y: CGFloat = 0
        pageRects.removeAll()
        bgContainer.subviews.forEach { $0.removeFromSuperview() }
        for (i, page) in pages.enumerated() {
            let h = page.w > 0 ? targetW * (page.h / page.w) : targetW * 1.414
            let rect = CGRect(x: 0, y: y, width: targetW, height: h)
            pageRects.append(rect)
            let iv = UIImageView(frame: rect)
            iv.contentMode = .scaleToFill
            iv.backgroundColor = .white
            iv.image = page.bg
            bgContainer.addSubview(iv)
            // ページ境界の区切り線（最終ページ以外）
            if i < pages.count - 1 {
                let sep = UIView(frame: CGRect(x: 0, y: y + h - 1, width: targetW, height: 2))
                sep.backgroundColor = UIColor(white: 0.66, alpha: 1.0)
                bgContainer.addSubview(sep)
            }
            y += h + pageGap
        }
        contentSizeVal = CGSize(width: targetW, height: max(y - pageGap, 1))
        canvasView.frame = bounds
        bgContainer.transform = .identity // サイズ設定中は等倍に戻す（syncBgが再追従）
        bgContainer.frame = CGRect(origin: .zero, size: contentSizeVal)
        canvasView.contentSize = contentSizeVal
        canvasView.contentInset = UIEdgeInsets(top: 8, left: 0, bottom: 40, right: 0)
    }

    private func setupToolPicker() {
        if toolPicker != nil { return }
        if #available(iOS 14.0, *) {
            let picker = PKToolPicker()
            picker.setVisible(true, forFirstResponder: canvasView)
            picker.addObserver(canvasView)
            canvasView.becomeFirstResponder()
            toolPicker = picker
        } else if #available(iOS 13.0, *) {
            if let win = window, let picker = PKToolPicker.shared(for: win) {
                picker.setVisible(true, forFirstResponder: canvasView)
                picker.addObserver(canvasView)
                canvasView.becomeFirstResponder()
                toolPicker = picker
            }
        }
    }

    func teardown() {
        displayLink?.invalidate(); displayLink = nil
        if #available(iOS 14.0, *) { toolPicker?.setVisible(false, forFirstResponder: canvasView) }
        toolPicker?.removeObserver(canvasView)
        canvasView.resignFirstResponder()
        toolPicker = nil
    }

    /// PKDrawing(base64) と ページ別 ink PNG(base64, 透明背景) を返す
    func exportResult() -> [String: Any] {
        let drawing = canvasView.drawing
        let drawingB64 = drawing.dataRepresentation().base64EncodedString()
        var thumbs: [String] = []
        let exportScale: CGFloat = 2.0
        for rect in pageRects {
            let img = drawing.image(from: rect, scale: exportScale)
            if let png = img.pngData() { thumbs.append(png.base64EncodedString()) } else { thumbs.append("") }
        }
        return ["drawing": drawingB64, "thumbnails": thumbs]
    }
}
