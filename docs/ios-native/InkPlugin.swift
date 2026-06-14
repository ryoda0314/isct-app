import Foundation
import UIKit
import PencilKit
import Capacitor

/// ネイティブ PencilKit 手書きキャンバス。
/// Web(NotesView) から `Ink.open({pages, drawing})` で全画面エディタを開き、
/// 「完了」で `{drawing, thumbnails}` を resolve して閉じる。
///
/// 導入: ViewController.capacitorDidLoad() で
///   bridge?.registerPluginInstance(InkPlugin())
/// （カスタムプラグインは registerPluginInstance で登録。packageClassList は不要）
@objc(InkPlugin)
public class InkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InkPlugin"
    public let jsName = "Ink"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
    ]

    private var controller: InkCanvasController?
    private var pendingCall: CAPPluginCall?

    @objc func open(_ call: CAPPluginCall) {
        guard let pagesRaw = call.getArray("pages") as? [[String: Any]], !pagesRaw.isEmpty else {
            call.reject("pages is required"); return
        }
        // ページ定義をパース（背景PNG base64 → UIImage、論理サイズ）
        var pages: [InkPage] = []
        for p in pagesRaw {
            let w = (p["w"] as? NSNumber)?.doubleValue ?? 1240
            let h = (p["h"] as? NSNumber)?.doubleValue ?? 1754
            var img: UIImage? = nil
            if let b64 = p["bg"] as? String, let data = Data(base64Encoded: b64) {
                img = UIImage(data: data)
            }
            pages.append(InkPage(w: CGFloat(w), h: CGFloat(h), bg: img))
        }
        // 既存の PKDrawing（再編集）
        var drawing = PKDrawing()
        if let db64 = call.getString("drawing"), let data = Data(base64Encoded: db64),
           let d = try? PKDrawing(data: data) {
            drawing = d
        }

        call.keepAlive = true // close まで保持
        pendingCall = call

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let host = self.bridge?.viewController else {
                call.reject("no host view controller"); self.pendingCall = nil; return
            }
            let vc = InkCanvasController(pages: pages, drawing: drawing)
            vc.modalPresentationStyle = .fullScreen
            vc.onDone = { [weak self] result in
                self?.finish(result)
            }
            self.controller = vc
            host.present(vc, animated: true, completion: nil)
        }
    }

    private func finish(_ result: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.controller?.dismiss(animated: true, completion: nil)
            self.controller = nil
            self.pendingCall?.resolve(result)
            self.pendingCall = nil
        }
    }
}

/// 1ページの定義
struct InkPage {
    let w: CGFloat
    let h: CGFloat
    let bg: UIImage?
}

/// 全画面の PencilKit エディタ。
/// 構成（GoodNotesと同じ方式）:
///   外側 UIScrollView（指でパン/ピンチズーム）
///     └ contentView（全ページを縦積み）
///          ├ 背景 UIImageView（ページごと）
///          └ PKCanvasView（全面・自前スクロール無効・ペンのみ描画）
/// → ペンで描画、指でスクロール/ズーム。背景とインクが一緒にズームする。
class InkCanvasController: UIViewController, UIScrollViewDelegate, PKToolPickerObserver {
    var onDone: (([String: Any]) -> Void)?

    private var pages: [InkPage]
    private let initialDrawing: PKDrawing
    private let scrollView = UIScrollView()
    private let contentView = UIView()
    private let canvasView = PKCanvasView()
    private var toolPicker: PKToolPicker?

    private let pageGap: CGFloat = 24
    private var pageRects: [CGRect] = []
    private var contentSizeVal: CGSize = .zero
    private var didLayout = false
    private var topBarHeight: CGFloat = 44

    init(pages: [InkPage], drawing: PKDrawing) {
        self.pages = pages
        self.initialDrawing = drawing
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0.93, alpha: 1.0)

        // 外側スクロール（指でパン/ズーム）
        scrollView.frame = view.bounds
        scrollView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scrollView.delegate = self
        scrollView.minimumZoomScale = 1.0
        scrollView.maximumZoomScale = 5.0
        scrollView.alwaysBounceVertical = true
        scrollView.backgroundColor = .clear
        scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(scrollView)

        scrollView.addSubview(contentView)

        // PKCanvasView は contentView 全面。自前スクロール無効＝外側に任せる。ペンのみ描画。
        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        canvasView.isScrollEnabled = false
        canvasView.drawing = initialDrawing
        if #available(iOS 14.0, *) {
            canvasView.drawingPolicy = .pencilOnly
        }
        contentView.addSubview(canvasView)

        setupToolPicker()
        setupTopBar()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let w = scrollView.bounds.width
        guard !didLayout, w > 0 else { return }
        didLayout = true
        topBarHeight = view.safeAreaInsets.top + 44
        layoutPages(targetW: w)
        contentView.frame = CGRect(origin: .zero, size: contentSizeVal)
        canvasView.frame = contentView.bounds
        scrollView.contentSize = contentSizeVal
        scrollView.contentInset = UIEdgeInsets(top: topBarHeight, left: 0, bottom: 60, right: 0)
        scrollView.contentOffset = CGPoint(x: 0, y: -topBarHeight)
    }

    /// ページを画面幅にフィットさせて縦積み。背景は canvasView の下に敷く。
    private func layoutPages(targetW: CGFloat) {
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
            iv.layer.shadowOpacity = 0.15
            iv.layer.shadowRadius = 6
            iv.layer.shadowOffset = CGSize(width: 0, height: 2)
            contentView.insertSubview(iv, at: 0) // canvasView の下へ
            y += h + pageGap
        }
        contentSizeVal = CGSize(width: targetW, height: max(y - pageGap, 1))
    }

    // ピンチズーム対象（背景＋インクを一緒に拡大）
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { return contentView }

    private func setupToolPicker() {
        if #available(iOS 14.0, *) {
            let picker = PKToolPicker()
            picker.setVisible(true, forFirstResponder: canvasView)
            picker.addObserver(canvasView)
            picker.addObserver(self)
            canvasView.becomeFirstResponder()
            toolPicker = picker
        } else if #available(iOS 13.0, *) {
            if let window = view.window, let picker = PKToolPicker.shared(for: window) {
                picker.setVisible(true, forFirstResponder: canvasView)
                picker.addObserver(canvasView)
                canvasView.becomeFirstResponder()
                toolPicker = picker
            }
        }
    }

    private func setupTopBar() {
        let bar = UIView()
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.backgroundColor = UIColor(white: 1.0, alpha: 0.96)
        view.addSubview(bar)

        let done = UIButton(type: .system)
        done.setTitle("完了", for: .normal)
        done.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        done.translatesAutoresizingMaskIntoConstraints = false
        done.addTarget(self, action: #selector(tapDone), for: .touchUpInside)
        bar.addSubview(done)

        let addPage = UIButton(type: .system)
        addPage.setTitle("＋ページ", for: .normal)
        addPage.translatesAutoresizingMaskIntoConstraints = false
        addPage.addTarget(self, action: #selector(tapAddPage), for: .touchUpInside)
        bar.addSubview(addPage)

        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 44),
            done.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            done.bottomAnchor.constraint(equalTo: bar.bottomAnchor, constant: -8),
            addPage.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            addPage.bottomAnchor.constraint(equalTo: bar.bottomAnchor, constant: -8),
        ])
        view.bringSubviewToFront(bar)
    }

    @objc private func tapAddPage() {
        let last = pages.last
        let w = last?.w ?? 1240
        let h = last?.h ?? 1754
        pages.append(InkPage(w: w, h: h, bg: nil))
        let targetW = scrollView.bounds.width
        layoutPages(targetW: targetW)
        contentView.frame = CGRect(origin: .zero, size: contentSizeVal)
        canvasView.frame = contentView.bounds
        scrollView.contentSize = contentSizeVal
    }

    @objc private func tapDone() {
        onDone?(exportResult())
    }

    /// PKDrawing(base64) と ページ別 ink PNG(base64, 透明背景) を返す
    private func exportResult() -> [String: Any] {
        let drawing = canvasView.drawing
        let drawingB64 = drawing.dataRepresentation().base64EncodedString()
        var thumbs: [String] = []
        let exportScale: CGFloat = 2.0
        for rect in pageRects {
            let img = drawing.image(from: rect, scale: exportScale)
            if let png = img.pngData() { thumbs.append(png.base64EncodedString()) }
            else { thumbs.append("") }
        }
        return ["drawing": drawingB64, "thumbnails": thumbs]
    }
}
