import Foundation

/// Which page a Universal Link or notification tap should open
/// (the Swift twin of android/…/DeepLinks.java).
///
///  - Universal Link: an https URL on the same host (and port) as the site.
///  - Notification tap: FCM data "link", a site-relative path such as
///    "/dashboard/notifications" (never "//host" or a full URL).
///
/// Returns the absolute URL to load, or nil to leave the WebView alone.
enum DeepLinks {
    static func resolve(server: URL?, url: URL?, link: String?) -> URL? {
        guard let server = server, let host = server.host, let scheme = server.scheme else { return nil }
        var base = "\(scheme)://\(host)"
        if let port = server.port { base += ":\(port)" }

        if let u = url, u.scheme?.lowercased() == "https", u.host?.lowercased() == host.lowercased(),
           u.port == server.port, u.user == nil, u.password == nil,
           let comps = URLComponents(url: u, resolvingAgainstBaseURL: false) {
            var path = comps.percentEncodedPath.isEmpty ? "/" : comps.percentEncodedPath
            if let q = comps.percentEncodedQuery { path += "?\(q)" }
            if let f = comps.percentEncodedFragment { path += "#\(f)" }
            return URL(string: base + path)
        }
        if let link = link, isSafePath(link) { return URL(string: base + link) }
        return nil
    }

    static func isSafePath(_ link: String) -> Bool {
        guard link.count <= 2048, link.hasPrefix("/"), !link.hasPrefix("//") else { return false }
        for scalar in link.unicodeScalars where scalar == "\\" || scalar.value < 0x21 || scalar.value == 0x7f {
            return false
        }
        return URL(string: "https://x.invalid" + link)?.host == "x.invalid"
    }
}
