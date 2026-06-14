import Foundation
import UIKit
import PencilKit
import Capacitor

/// ネイティブ PencilKit 手書きキャンバスを「Webの指定領域に重ねる」プラグイン（オーバーレイ方式）。
/// 全画面モーダルではなく、Web のキャンバス領域(rect)にだけ重ねるので、Web のサイドバー/
/// ツールバーは表示されたまま。ペンで描画、指でスクロール/ズーム。
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
/// 構成: scrollView(指でパン/ズーム) → contentView(背景UIImageView + PKCanvasView 全面・ペンのみ)
class InkOverlayView: UIView, UIScrollViewDelegate {
    private var pages: [InkPage]
    private let scrollView = UIScrollView()
    private let contentView = UIView()
    private let canvasView = PKCanvasView()
    private var toolPicker: PKToolPicker?
    private let pageGap: CGFloat = 24
    private var pageRects: [CGRect] = []
    private var contentSizeVal: CGSize = .zero
    private var didLayout = false

    init(frame: CGRect, pages: [InkPage], drawing: PKDrawing) {
        self.pages = pages
        super.init(frame: frame)
        backgroundColor = UIColor(white: 0.93, alpha: 1.0)
        clipsToBounds = true

        scrollView.frame = bounds
        scrollView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scrollView.delegate = self
        scrollView.minimumZoomScale = 1.0
        scrollView.maximumZoomScale = 5.0
        scrollView.alwaysBounceVertical = true
        scrollView.backgroundColor = .clear
        scrollView.contentInsetAdjustmentBehavior = .never
        addSubview(scrollView)
        scrollView.addSubview(contentView)

        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        canvasView.isScrollEnabled = false
        canvasView.drawing = drawing
        if #available(iOS 14.0, *) { canvasView.drawingPolicy = .pencilOnly }
        contentView.addSubview(canvasView)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        layoutIfNeeded()
        relayout()
        setupToolPicker()
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
        contentView.subviews.forEach { if $0 !== canvasView { $0.removeFromSuperview() } }
        for page in pages {
            let h = page.w > 0 ? targetW * (page.h / page.w) : targetW * 1.414
            let rect = CGRect(x: 0, y: y, width: targetW, height: h)
            pageRects.append(rect)
            let iv = UIImageView(frame: rect)
            iv.contentMode = .scaleToFill
            iv.backgroundColor = .white
            iv.image = page.bg
            iv.layer.shadowColor = UIColor.black.cgColor
            iv.layer.shadowOpacity = 0.12
            iv.layer.shadowRadius = 5
            iv.layer.shadowOffset = CGSize(width: 0, height: 2)
            contentView.insertSubview(iv, at: 0)
            y += h + pageGap
        }
        contentSizeVal = CGSize(width: targetW, height: max(y - pageGap, 1))
        contentView.frame = CGRect(origin: .zero, size: contentSizeVal)
        canvasView.frame = contentView.bounds
        scrollView.frame = bounds
        scrollView.contentSize = contentSizeVal
        scrollView.contentInset = UIEdgeInsets(top: 8, left: 0, bottom: 40, right: 0)
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { return contentView }

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
