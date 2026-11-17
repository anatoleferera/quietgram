import UIKit
import WebKit

/// A single full-screen web view showing instagram.com.
/// All filtering rules live in Web/filter.js, which is injected before each page loads.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private let home = URL(string: "https://www.instagram.com/")!
    private var webView: WKWebView!

    /// Hosts that load inside the app. Everything else opens in Safari.
    private let internalHosts = ["instagram.com", "facebook.com"]
    /// Instagram's outbound-link redirector: hand these to Safari.
    private let externalHosts = ["l.instagram.com", "l.facebook.com"]

    // MARK: Setup

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // keeps you logged in between launches
        config.allowsInlineMediaPlayback = true
        // Let videos start with sound without a tap on each one (filter.js remembers the choice).
        config.mediaTypesRequiringUserActionForPlayback = []
        // Present as mobile Safari so Instagram serves its full mobile site.
        config.applicationNameForUserAgent = "Version/17.5 Mobile/15E148 Safari/604.1"

        let script = WKUserScript(
            source: Self.loadFilterScript(),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(script)
        config.userContentController.add(CopyHandler(), name: "qgCopy")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(refreshPulled(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        webView.load(URLRequest(url: home))
    }

    private static func loadFilterScript() -> String {
        guard let url = Bundle.main.url(forResource: "filter", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            assertionFailure("filter.js is missing from the app bundle")
            return ""
        }
        return source
    }

    @objc private func refreshPulled(_ sender: UIRefreshControl) {
        if webView.url == nil {
            webView.load(URLRequest(url: home))
        } else {
            webView.reload()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            sender.endRefreshing()
        }
    }

    // MARK: Navigation

    private func hostMatches(_ host: String, _ list: [String]) -> Bool {
        list.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Only police top-level navigation; let embedded frames load.
        if let frame = navigationAction.targetFrame, !frame.isMainFrame {
            decisionHandler(.allow)
            return
        }

        let scheme = (url.scheme ?? "").lowercased()
        if ["about", "blob", "data"].contains(scheme) {
            decisionHandler(.allow)
            return
        }
        guard scheme == "http" || scheme == "https" else {
            // instagram:// and similar would jump to the official app. Stay here.
            decisionHandler(.cancel)
            return
        }

        let host = (url.host ?? "").lowercased()
        let isInternal = hostMatches(host, internalHosts) && !hostMatches(host, externalHosts)

        if !isInternal {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        if navigationAction.targetFrame == nil {
            // target="_blank" link to Instagram itself: open it in this view.
            webView.load(navigationAction.request)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: WKUIDelegate

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Popups (window.open) load in the same view; navigation rules above still apply.
        if navigationAction.request.url != nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}

/// Receives the diagnostics report from filter.js and puts it on the clipboard.
private final class CopyHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        if let text = message.body as? String {
            UIPasteboard.general.string = text
        }
    }
}
