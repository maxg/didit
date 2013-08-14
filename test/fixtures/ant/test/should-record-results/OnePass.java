import org.junit.*;

public class OnePass {
    @Test public void pass() {
        System.out.println("text on stdout");
        System.err.println("text on stderr");
        Assert.assertTrue(true);
    }
}
