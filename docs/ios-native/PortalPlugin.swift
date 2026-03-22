import Foundation
import UIKit
import WebKit
import Capacitor

@objc(PortalPlugin)
public class PortalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PortalPlugin"
    public let jsName = "Portal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openPortal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openIsctPortal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openLmsPage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closePortal", returnType: CAPPluginReturnPromise),
    ]

    private static let titechLoginUrl =
        "https://portal.nap.gsic.titech.ac.jp/GetAccess/Login"
        + "?Template=userpass_key&AUTHMETHOD=UserPassword"
        + "&GAREASONCODE=-1&GARESOURCEID=resourcelistID2"
        + "&GAURI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList"
        + "&Reason=-1&APPID=resourcelistID2"
        + "&URI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList"

    private static let isctPortalUrl = "https://isct.ex-tic.com/auth/session"

    // Shared state
    private var overlayView: UIView?
    private var webView: WKWebView?
    private var loadingOverlay: UIView?
    private var isIsctMode = false

    // TiTech Portal state
    private var loginDone = false
    private var matrixDone = false
    private var userId: String?
    private var password: String?
    private var matrixJson: String?

    // ISCT Portal state
    private var isctLoginDone = false
    private var isctTotpDone = false
    private var isctSamlDone = false
    private var isctUserId: String?
    private var isctPassword: String?
    private var isctTotpCode: String?
    private var lmsTargetUrl: String?

    // MARK: - Plugin Methods

    @objc func openPortal(_ call: CAPPluginCall) {
        userId = call.getString("userId")
        password = call.getString("password")
        matrixJson = call.getString("matrixJson")

        guard userId != nil, password != nil else {
            call.reject("Missing userId or password")
            return
        }

        isIsctMode = false
        DispatchQueue.main.async {
            self.showOverlay(title: "ポータル", loadingText: "ポータルにログイン中...",
                             startUrl: PortalPlugin.titechLoginUrl)
        }
        call.resolve()
    }

    @objc func openIsctPortal(_ call: CAPPluginCall) {
        isctUserId = call.getString("userId")
        isctPassword = call.getString("password")
        isctTotpCode = call.getString("totpCode")

        guard isctUserId != nil, isctPassword != nil, isctTotpCode != nil else {
            call.reject("Missing userId, password, or totpCode")
            return
        }

        isIsctMode = true
        lmsTargetUrl = nil
        DispatchQueue.main.async {
            self.showOverlay(title: "ISCTポータル", loadingText: "ISCTポータルにログイン中...",
                             startUrl: PortalPlugin.isctPortalUrl)
        }
        call.resolve()
    }

    @objc func openLmsPage(_ call: CAPPluginCall) {
        isctUserId = call.getString("userId")
        isctPassword = call.getString("password")
        isctTotpCode = call.getString("totpCode")
        lmsTargetUrl = call.getString("url")

        guard isctUserId != nil, isctPassword != nil, isctTotpCode != nil, lmsTargetUrl != nil else {
            call.reject("Missing userId, password, totpCode, or url")
            return
        }

        isIsctMode = true
        DispatchQueue.main.async {
            self.showOverlay(title: "LMS", loadingText: "LMSにログイン中...",
                             startUrl: PortalPlugin.isctPortalUrl)
        }
        call.resolve()
    }

    @objc func closePortal(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.removeOverlay() }
        call.resolve()
    }

    // MARK: - Overlay UI

    private func showOverlay(title: String, loadingText: String, startUrl: String) {
        guard let viewController = bridge?.viewController else { return }
        let rootView = viewController.view!

        // Remove existing overlay
        removeOverlay()

        // Reset state
        loginDone = false
        matrixDone = false
        isctLoginDone = false
        isctTotpDone = false
        isctSamlDone = false

        let bottomNavHeight: CGFloat = 78

        // Container
        let container = UIView()
        container.backgroundColor = .white
        container.tag = 9999
        rootView.addSubview(container)
        container.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            container.topAnchor.constraint(equalTo: rootView.topAnchor),
            container.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            container.bottomAnchor.constraint(equalTo: rootView.bottomAnchor, constant: -bottomNavHeight),
        ])
        overlayView = container

        // Toolbar
        let toolbar = UIView()
        toolbar.backgroundColor = UIColor(red: 0.96, green: 0.90, blue: 0.88, alpha: 1)
        container.addSubview(toolbar)
        toolbar.translatesAutoresizingMaskIntoConstraints = false

        let safeTop = viewController.view.safeAreaInsets.top
        let toolbarHeight: CGFloat = 44 + safeTop
        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: container.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: toolbarHeight),
        ])

        // Close button
        let closeBtn = UIButton(type: .system)
        closeBtn.setTitle("✕", for: .normal)
        closeBtn.titleLabel?.font = .systemFont(ofSize: 18)
        closeBtn.setTitleColor(UIColor(white: 0.33, alpha: 1), for: .normal)
        closeBtn.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        toolbar.addSubview(closeBtn)
        closeBtn.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            closeBtn.leadingAnchor.constraint(equalTo: toolbar.leadingAnchor, constant: 4),
            closeBtn.bottomAnchor.constraint(equalTo: toolbar.bottomAnchor),
            closeBtn.widthAnchor.constraint(equalToConstant: 44),
            closeBtn.heightAnchor.constraint(equalToConstant: 44),
        ])

        // Title
        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = .systemFont(ofSize: 17)
        titleLabel.textColor = UIColor(red: 0.1, green: 0.1, blue: 0.18, alpha: 1)
        toolbar.addSubview(titleLabel)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: closeBtn.trailingAnchor, constant: 4),
            titleLabel.centerYAnchor.constraint(equalTo: closeBtn.centerYAnchor),
        ])

        // Nav buttons
        let navColor = UIColor(white: 0.33, alpha: 1)
        let navFont = UIFont.systemFont(ofSize: 18)

        let backBtn = UIButton(type: .system)
        backBtn.setTitle("❮", for: .normal)
        backBtn.titleLabel?.font = navFont
        backBtn.setTitleColor(navColor, for: .normal)
        backBtn.addTarget(self, action: #selector(backTapped), for: .touchUpInside)

        let fwdBtn = UIButton(type: .system)
        fwdBtn.setTitle("❯", for: .normal)
        fwdBtn.titleLabel?.font = navFont
        fwdBtn.setTitleColor(navColor, for: .normal)
        fwdBtn.addTarget(self, action: #selector(forwardTapped), for: .touchUpInside)

        let reloadBtn = UIButton(type: .system)
        reloadBtn.setTitle("↻", for: .normal)
        reloadBtn.titleLabel?.font = .systemFont(ofSize: 20)
        reloadBtn.setTitleColor(navColor, for: .normal)
        reloadBtn.addTarget(self, action: #selector(reloadTapped), for: .touchUpInside)

        let navStack = UIStackView(arrangedSubviews: [backBtn, fwdBtn, reloadBtn])
        navStack.axis = .horizontal
        navStack.spacing = 0
        toolbar.addSubview(navStack)
        navStack.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            navStack.trailingAnchor.constraint(equalTo: toolbar.trailingAnchor, constant: -12),
            navStack.centerYAnchor.constraint(equalTo: closeBtn.centerYAnchor),
        ])
        for btn in [backBtn, fwdBtn, reloadBtn] {
            btn.widthAnchor.constraint(equalToConstant: 40).isActive = true
            btn.heightAnchor.constraint(equalToConstant: 44).isActive = true
        }

        // Progress bar
        let progressBar = UIProgressView(progressViewStyle: .default)
        progressBar.isHidden = true
        container.addSubview(progressBar)
        progressBar.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            progressBar.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
            progressBar.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            progressBar.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])

        // WebView
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()  // Share cookies across WebViews
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        wv.customUserAgent =
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
            + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        container.addSubview(wv)
        wv.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            wv.topAnchor.constraint(equalTo: progressBar.bottomAnchor),
            wv.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            wv.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            wv.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        webView = wv

        // Loading overlay
        let loading = createLoadingView(text: loadingText)
        container.addSubview(loading)
        loading.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            loading.topAnchor.constraint(equalTo: progressBar.bottomAnchor),
            loading.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            loading.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            loading.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        loadingOverlay = loading

        // Bottom nav touch interceptor
        let navInterceptor = UIView()
        navInterceptor.tag = 9998
        navInterceptor.backgroundColor = .clear
        rootView.addSubview(navInterceptor)
        navInterceptor.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            navInterceptor.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            navInterceptor.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            navInterceptor.bottomAnchor.constraint(equalTo: rootView.bottomAnchor),
            navInterceptor.heightAnchor.constraint(equalToConstant: bottomNavHeight),
        ])
        let tap = UITapGestureRecognizer(target: self, action: #selector(bottomNavTapped(_:)))
        navInterceptor.addGestureRecognizer(tap)

        // Load URL
        if let url = URL(string: startUrl) {
            wv.load(URLRequest(url: url))
        }
    }

    private func createLoadingView(text: String) -> UIView {
        let view = UIView()
        view.backgroundColor = .white

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.startAnimating()
        view.addSubview(spinner)
        spinner.translatesAutoresizingMaskIntoConstraints = false

        let label = UILabel()
        label.text = text
        label.font = .systemFont(ofSize: 14)
        label.textColor = UIColor(white: 0.4, alpha: 1)
        label.textAlignment = .center
        view.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -20),
            label.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])

        return view
    }

    // MARK: - Actions

    @objc private func closeTapped() { removeOverlay() }

    @objc private func backTapped() {
        if webView?.canGoBack == true { webView?.goBack() }
    }

    @objc private func forwardTapped() {
        if webView?.canGoForward == true { webView?.goForward() }
    }

    @objc private func reloadTapped() { webView?.reload() }

    @objc private func bottomNavTapped(_ gesture: UITapGestureRecognizer) {
        let location = gesture.location(in: bridge?.viewController?.view)
        removeOverlay()

        // Forward tap to Capacitor WebView
        if let capWebView = bridge?.webView {
            let point = capWebView.convert(location, from: capWebView.superview)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                let down = UIEvent()
                // Use hitTest to simulate tap
                capWebView.evaluateJavaScript(
                    "document.elementFromPoint(\(point.x), \(point.y))?.click()"
                )
            }
        }
    }

    // MARK: - Overlay Management

    private func removeOverlay() {
        // Remove nav interceptor
        if let vc = bridge?.viewController {
            vc.view.viewWithTag(9998)?.removeFromSuperview()
        }

        webView?.stopLoading()
        webView?.navigationDelegate = nil
        webView = nil
        loadingOverlay = nil
        overlayView?.removeFromSuperview()
        overlayView = nil
    }

    private func hideLoading() {
        guard let loading = loadingOverlay, !loading.isHidden else { return }
        UIView.animate(withDuration: 0.2, animations: {
            loading.alpha = 0
        }) { _ in
            loading.isHidden = true
        }
    }

    // MARK: - TiTech Portal Login

    private func handleTitechPageFinished(_ url: String) {
        if !loginDone {
            injectTitechLogin()
        } else if !matrixDone, matrixJson != nil, url.contains("AUTHMETHOD=IG") {
            injectTitechMatrix()
        } else {
            matrixDone = true
            hideLoading()
        }
    }

    private func injectTitechLogin() {
        let js = """
        (function(){
            var u=document.querySelector('input[name="usr_name"]');
            var p=document.querySelector('input[name="usr_password"]');
            var ok=document.querySelector('input[name="OK"]');
            if(u&&p&&ok){
                u.value='\(escapeJs(userId ?? ""))';
                p.value='\(escapeJs(password ?? ""))';
                ok.click();
                return 'login';
            }
            return '';
        })()
        """
        webView?.evaluateJavaScript(js) { [weak self] result, _ in
            if let r = result as? String, r.contains("login") {
                self?.loginDone = true
            }
        }
    }

    private func injectTitechMatrix() {
        guard let matrixJson = matrixJson else { return }
        let js = """
        (function(){
            var inp=document.querySelector('input[name="message3"]');
            if(!inp)return '';
            var inputs=['message3','message4','message5'];
            var labels=[];
            var cells=document.querySelectorAll('td,th');
            for(var i=0;i<cells.length;i++){
                var t=cells[i].textContent.trim();
                if(/^\\[?[A-J],\\s*\\d\\]?$/i.test(t))labels.push(t);
            }
            if(labels.length<3)return '';
            var matrix=\(matrixJson);
            for(var j=0;j<3;j++){
                var m=labels[j].match(/\\[?([A-J]),\\s*(\\d)\\]?/i);
                if(!m)continue;
                var val=matrix[m[1].toUpperCase()]&&matrix[m[1].toUpperCase()][m[2]]||'';
                var el=document.querySelector('input[name="'+inputs[j]+'"]');
                if(el)el.value=val;
            }
            var ok=document.querySelector('input[name="OK"]');
            if(ok)ok.click();
            return 'matrix';
        })()
        """
        webView?.evaluateJavaScript(js) { [weak self] result, _ in
            if let r = result as? String, r.contains("matrix") {
                self?.matrixDone = true
            }
        }
    }

    // MARK: - ISCT Portal SSO Login

    private func handleIsctPageFinished(_ url: String) {
        NSLog("PortalPlugin: handleIsctPageFinished url=\(url) loginDone=\(isctLoginDone) totpDone=\(isctTotpDone) samlDone=\(isctSamlDone)")

        // If landed on a non-auth page, we're already authenticated
        if !isctLoginDone,
           !url.contains("/auth/"), !url.contains("/saml"), !url.contains("/login") {
            NSLog("PortalPlugin: Already authenticated, skipping SSO")
            isctLoginDone = true
            isctTotpDone = true
            isctSamlDone = true
            if let target = lmsTargetUrl, let targetUrl = URL(string: target) {
                NSLog("PortalPlugin: Navigating to LMS: \(target)")
                webView?.load(URLRequest(url: targetUrl))
                lmsTargetUrl = nil
                return
            }
            hideLoading()
            return
        }

        if !isctLoginDone {
            injectIsctLogin()
        } else if !isctTotpDone {
            injectIsctTotp()
        } else if !isctSamlDone {
            injectSamlSubmit()
        } else {
            if let target = lmsTargetUrl, let targetUrl = URL(string: target) {
                NSLog("PortalPlugin: SSO complete, navigating to LMS: \(target)")
                webView?.load(URLRequest(url: targetUrl))
                lmsTargetUrl = nil
            } else {
                hideLoading()
            }
        }
    }

    private func injectIsctLogin() {
        let js = """
        (function(){
            var id=document.querySelector('input#identifier');
            if(!id)return 'wait';
            id.value='\(escapeJs(isctUserId ?? ""))';
            var pw=document.querySelector('input#password');
            if(pw){pw.value='\(escapeJs(isctPassword ?? ""))';}
            var form=id.closest('form');
            if(form){form.submit();return 'login';}
            return '';
        })()
        """
        webView?.evaluateJavaScript(js) { [weak self] result, _ in
            if let r = result as? String, r.contains("login") {
                self?.isctLoginDone = true
            }
        }
    }

    private func injectIsctTotp() {
        let js = """
        (function(){
            var totp=document.querySelector('input#totp');
            if(!totp)return 'no_totp';
            totp.value='\(escapeJs(isctTotpCode ?? ""))';
            var form=totp.closest('form');
            if(form){form.submit();return 'totp';}
            return '';
        })()
        """
        webView?.evaluateJavaScript(js) { [weak self] result, _ in
            if let r = result as? String, r.contains("totp") {
                self?.isctTotpDone = true
            }
        }
    }

    private func injectSamlSubmit() {
        let js = """
        (function(){
            var form=document.querySelector('form');
            var saml=document.querySelector('input[name="SAMLResponse"]');
            if(form&&saml){form.submit();return 'saml';}
            return 'done';
        })()
        """
        webView?.evaluateJavaScript(js) { [weak self] result, _ in
            self?.isctSamlDone = true
            if let r = result as? String, r.contains("done") {
                self?.hideLoading()
            }
        }
    }

    // MARK: - Utilities

    private func escapeJs(_ s: String) -> String {
        return s
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
    }
}

// MARK: - WKNavigationDelegate

extension PortalPlugin: WKNavigationDelegate {
    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let url = webView.url?.absoluteString ?? ""
        NSLog("PortalPlugin: didFinish: \(url)")
        if isIsctMode {
            handleIsctPageFinished(url)
        } else {
            handleTitechPageFinished(url)
        }
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("PortalPlugin: didFail: \(error.localizedDescription)")
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("PortalPlugin: didFailProvisional: \(error.localizedDescription)")
    }

    public func webView(_ webView: WKWebView,
                        decidePolicyFor navigationAction: WKNavigationAction,
                        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(.allow)
    }
}
