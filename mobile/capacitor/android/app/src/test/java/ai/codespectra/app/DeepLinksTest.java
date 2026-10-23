package ai.codespectra.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class DeepLinksTest {
    private static final String SERVER = "https://codespectra.ai";

    @Test
    public void appLinkOnOurHostOpens() {
        assertEquals("https://codespectra.ai/dashboard/tests?x=1#q2",
            DeepLinks.resolve(SERVER, "https://codespectra.ai/dashboard/tests?x=1#q2", null));
    }

    @Test
    public void otherHostsAndSchemesAreIgnored() {
        assertNull(DeepLinks.resolve(SERVER, "https://evil.example/dashboard", null));
        assertNull(DeepLinks.resolve(SERVER, "http://codespectra.ai/dashboard", null));
        assertNull(DeepLinks.resolve(SERVER, "https://user@codespectra.ai/dashboard", null));
        assertNull(DeepLinks.resolve(SERVER, "javascript:alert(1)", null));
    }

    @Test
    public void notificationLinkMustBeASitePath() {
        assertEquals("https://codespectra.ai/dashboard/notifications",
            DeepLinks.resolve(SERVER, null, "/dashboard/notifications"));
        assertNull(DeepLinks.resolve(SERVER, null, "//evil.example/x"));
        assertNull(DeepLinks.resolve(SERVER, null, "https://evil.example/x"));
        assertNull(DeepLinks.resolve(SERVER, null, "/\\evil.example"));
        assertNull(DeepLinks.resolve(SERVER, null, "/a b"));
        assertNull(DeepLinks.resolve(SERVER, null, null));
    }

    @Test
    public void flavourServerKeepsItsOwnHost() {
        assertEquals("https://staging.codespectra.ai/learn",
            DeepLinks.resolve("https://staging.codespectra.ai", null, "/learn"));
    }
}
