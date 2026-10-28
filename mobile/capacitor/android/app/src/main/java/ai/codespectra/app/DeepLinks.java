package ai.codespectra.app;

import java.net.URI;

/**
 * Which page a launch intent should open. Pure Java (unit-tested on the JVM).
 *
 *  - App Link: an https URL on the same host as the configured site.
 *  - Notification tap: FCM data "link", a site-relative path such as
 *    "/dashboard/notifications" (never "//host" or a full URL).
 *
 * Returns the absolute URL to load, or null to leave the WebView alone.
 */
final class DeepLinks {
    private DeepLinks() {}

    static String resolve(String serverUrl, String data, String link) {
        URI server = parse(serverUrl);
        if (server == null || server.getHost() == null) return null;
        String base = server.getScheme() + "://" + server.getRawAuthority();

        if (data != null && !data.isEmpty()) {
            URI u = parse(data);
            if (u != null && "https".equalsIgnoreCase(u.getScheme())
                && server.getHost().equalsIgnoreCase(u.getHost())
                && u.getPort() == server.getPort()
                && u.getRawUserInfo() == null) {
                return base + pathOf(u);
            }
        }
        if (isSafePath(link)) return base + link;
        return null;
    }

    static boolean isSafePath(String link) {
        if (link == null || link.length() > 2048 || !link.startsWith("/") || link.startsWith("//")) return false;
        for (int i = 0; i < link.length(); i++) {
            char c = link.charAt(i);
            if (c == '\\' || c < 0x21 || c == 0x7f) return false;
        }
        URI u = parse("https://x.invalid" + link);
        return u != null && "x.invalid".equals(u.getHost());
    }

    private static String pathOf(URI u) {
        String path = u.getRawPath() == null || u.getRawPath().isEmpty() ? "/" : u.getRawPath();
        if (u.getRawQuery() != null) path += "?" + u.getRawQuery();
        if (u.getRawFragment() != null) path += "#" + u.getRawFragment();
        return path;
    }

    private static URI parse(String s) {
        try {
            return new URI(s);
        } catch (Exception e) {
            return null;
        }
    }
}
