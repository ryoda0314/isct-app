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
/// capacitor.config.json の packageClassList に "InkPlugin" を追加。
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

/// 全画面の PencilKit エディタ（連続スクロール・PKToolPicker）
class InkCanvasController: UIViewController, PKCanvasViewDelegate, PKToolPickerObserver {
    var onDone: (([String: Any]) -> Void)?

    private var pages: [InkPage]
    private let initialDrawing: PKDrawing
    private let canvasView = PKCanvasView()
    private var toolPicker: PKToolPicker?
    private let bgContainer = UIView()

    // ページ間ギャップ（points）。背景画像はページ論理サイズをそのまま points として配置。
    private let pageGap: CGFloat = 24
    // ページ矩形（content 座標）を保持し、保存時のページ別書き出しに使う
    private var pageRects: [CGRect] = []
    private var contentSize: CGSize = .zero

    init(pages: [InkPage], drawing: PKDrawing) {
        self.pages = pages
        self.initialDrawing = drawing
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0.93, alpha: 1.0)

        layoutPages()

        // PKCanvasView（= UIScrollView）
        canvasView.frame = view.bounds
        canvasView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        canvasView.alwaysBounceVertical = true
        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        canvasView.delegate = self
        if #available(iOS 14.0, *) {
            canvasView.drawingPolicy = .anyInput // 指でも描けるが、PKToolPicker側でPencil限定可
        }
        canvasView.drawing = initialDrawing
        // 背景をスクロール連動でぶら下げる
        bgContainer.frame = CGRect(origin: .zero, size: contentSize)
        canvasView.insertSubview(bgContainer, at: 0)
        canvasView.contentSize = contentSize
        // ズーム
        canvasView.minimumZoomScale = 0.4
        canvasView.maximumZoomScale = 6.0
        view.addSubview(canvasView)

        setupToolPicker()
        setupTopBar()

        // 横幅にフィットする初期ズーム
        DispatchQueue.main.async { [weak self] in self?.fitWidth() }
    }

    /// 背景を縦に積んで bgContainer に配置し、pageRects/contentSize を計算
    private func layoutPages() {
        var y: CGFloat = 0
        var maxW: CGFloat = 0
        pageRects.removeAll()
        bgContainer.subviews.forEach { $0.removeFromSuperview() }
        for page in pages {
            let rect = CGRect(x: 0, y: y, width: page.w, height: page.h)
            pageRects.append(rect)
            let iv = UIImageView(frame: rect)
            iv.contentMode = .scaleToFill
            iv.backgroundColor = .white
            iv.image = page.bg
            iv.layer.shadowColor = UIColor.black.cgColor
            iv.layer.shadowOpacity = 0.15
            iv.layer.shadowRadius = 6
            iv.layer.shadowOffset = CGSize(width: 0, height: 2)
            bgContainer.addSubview(iv)
            maxW = max(maxW, page.w)
            y += page.h + pageGap
        }
        contentSize = CGSize(width: maxW, height: max(y - pageGap, 1))
    }

    private func setupToolPicker() {
        if #available(iOS 14.0, *) {
            let picker = PKToolPicker()
            picker.setVisible(true, forFirstResponder: canvasView)
            picker.addObserver(canvasView)
            picker.addObserver(self)
            canvasView.becomeFirstResponder()
            toolPicker = picker
        } else if #available(iOS 13.0, *) {
            // iOS13: ウィンドウ共有のツールピッカー
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
        // ツールバー下にキャンバス上端が来るよう inset
        canvasView.contentInset = UIEdgeInsets(top: view.safeAreaInsets.top + 44, left: 0, bottom: 40, right: 0)
    }

    // UIScrollView ズーム対象
    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        // PKCanvasView は自身の drawing をズームする。背景もスクロール連動。
        // PencilKit は内部で zoom を扱うため nil 返しでも標準ズームが効く構成が多いが、
        // 背景コンテナをズーム対象にすることで bg も拡大させる。
        return bgContainer
    }

    private func fitWidth() {
        guard contentSize.width > 0 else { return }
        let avail = canvasView.bounds.width
        let scale = max(canvasView.minimumZoomScale, min(canvasView.maximumZoomScale, avail / contentSize.width))
        canvasView.zoomScale = scale
        canvasView.contentOffset = CGPoint(x: 0, y: -canvasView.contentInset.top)
    }

    @objc private func tapAddPage() {
        // v1: 白紙ページを末尾に追加（背景なし＝白）
        let last = pages.last
        let w = last?.w ?? 1240
        let h = last?.h ?? 1754
        pages.append(InkPage(w: w, h: h, bg: nil))
        layoutPages()
        bgContainer.frame = CGRect(origin: .zero, size: contentSize)
        canvasView.contentSize = contentSize
    }

    @objc private func tapDone() {
        let result = exportResult()
        onDone?(result)
    }

    /// PKDrawing(base64) と ページ別 ink PNG(base64, 透明背景) を返す
    private func exportResult() -> [String: Any] {
        let drawing = canvasView.drawing
        let drawingB64 = drawing.dataRepresentation().base64EncodedString()
        var thumbs: [String] = []
        let exportScale: CGFloat = 2.0
        for rect in pageRects {
            // そのページ範囲の手書きのみを画像化（透明背景）
            let img = drawing.image(from: rect, scale: exportScale)
            if let png = img.pngData() {
                thumbs.append(png.base64EncodedString())
            } else {
                thumbs.append("")
            }
        }
        return ["drawing": drawingB64, "thumbnails": thumbs]
    }
}
