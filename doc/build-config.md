---
title: Build configuration
subtitle: Compiling and testing with build.xml
category: user
---

# Building configuration: `build.xml`

Didit builds projects using [Ant](http://ant.apache.org).

As the author of a build configuration, **security is your problem**.
Read **[build security]** for details.

Didit uses three Ant targets:

 * **`compile`**: compile student and public test code.
   Compilation success or failure plus console output is reported to students.

 * **`public`**: run public tests.
   Public test results and output are reported to students.

 * **`hidden`**: compile and run hidden tests.
   Hidden test results only are reported to students if and when they are released in a grade report.

The discussion below is for Java and JUnit, but any build testing process that generates results in the Ant JUnit XML format will work.
Unfortunately, [this XML format](http://stackoverflow.com/questions/442556/spec-for-junit-xml-output) is not a documented standard.

## `compile`

To ensure consistent compilation:
{% highlight xml %}
<property name="ant.build.javac.target" value="..."/>
<property name="build.sysclasspath" value="ignore"/>
{% endhighlight %}

Didit provides `eclipse.home` so student repos do not have to contain materials already distributed with Eclipse.
You can require `eclipse.home` when staff [run the build manually]:
{% highlight xml %}
<fail unless="eclipse.home"/>
{% endhighlight %}

Find JUnit:
{% highlight xml %}
<path id="eclipse.junit.jar">
    <fileset dir="${eclipse.home}" includes="**/org.junit_4*/junit.jar"/>
    <fileset dir="${eclipse.home}" includes="**/org.junit4_4*/junit.jar"/>
    <fileset dir="${eclipse.home}" includes="**/org.hamcrest.core_*.jar"/>
</path>
{% endhighlight %}

Then compile against JUnit by using `refid="eclipse.junit.jar"` in the classpath.

Make sure compilation destination directories are removed (e.g. in a `clean` target) and created by the compilation, e.g.:
{% highlight xml %}
<target name="clean">
    <delete dir="bin-student"/>
    <delete dir="bin-public"/>
    <delete dir="bin-hidden"/>
</target>
{% endhighlight %}

Compilation usually takes place in two steps.
For example:
{% highlight xml %}
<target name="compile-student">
    <mkdir dir="bin-student"/>
    <javac srcdir="src" destdir="bin-student" debug="on">
        <include name="ps0/*.java"/>
        <classpath>
            <path refid="eclipse.junit.jar"/>
        </classpath>
    </javac>
</target>

<target name="compile-public">
    <mkdir dir="bin-public"/>
    <javac srcdir="grader-proj/src" destdir="bin-public" debug="on">
        <include name="ps0/staff/*.java"/>
        <classpath>
            <path refid="eclipse.junit.jar"/>
            <pathelement location="bin-student"/>
        </classpath>
    </javac>
</target>
{% endhighlight %}

**Delay hidden test compilation.**
Since compilation output is reported to students, you may want to delay compilation of the hidden tests.

**Compile against dummy versions.**
In some situations, "empty" versions of the student or staff code may be useful.
For example, compile an "empty" implementation of the assignment with the correct method signatures but no code; then compile student-written tests against that empty implementation.
Compilation will succeed only if the student is testing against the required specs.
In the test targets, those tests can run against staff-provided implementations.

## `public` and `hidden` tests

**Since security is your problem**, you will want to read the documentation on **[build security]**:

+ Test targets should delete existing Ant JUnit test reports, `TEST*.xml`.
+ Test targets should generate a Java security policy and run Java with the security manager enforcing the policy.

Here's an outline of what the `public` and `hidden` targets might look like:
{% highlight xml %}
<target name="test-clean">
    <delete><fileset dir="." includes="TEST*.xml"/></delete>
    <delete><fileset file="security.policy"/></delete>
    <echo file="security.policy"> ... </echo>
</target>

<target name="public" depends="test-clean">
    <junit fork="yes" timeout="...">
        <jvmarg line="-Djava.security.manager -Djava.security.policy=security.policy"/>
        <jvmarg value="-Ddidit.desc=..."/>
        <formatter type="xml" usefile="true"/>
        <test name="..." />
        <classpath> ... </classpath>
    </junit>
    <junit fork="yes" timeout="...">
        ...
    </junit>
    <junitreport><fileset dir="." includes="TEST-*.xml"/></junitreport>
</target>

<target name="hidden" depends="test-clean, compile-hidden">
    ...
</target>
{% endhighlight %}

In most cases, you want to run Ant JUnit tasks with `fork="yes"` so a separate process is used for each test class.
JUnit cannot reliably enforce timeouts for badly-behaving code, but including a timeout is advisable.
E.g.:
{% highlight xml %}
<junit fork="yes" timeout="5000"> ... </junit>
{% endhighlight %}

+   You can select test classes individually with nested `test` elements:
  
        <test name="ps0.staff.TurtleTest"/>
  
    Or multiple classes with `batchtest`:
  
        <batchtest>
            <fileset dir="bin-tests" includes="ps0/staff/*Test.class"/>
        </batchtest>

+   You want a JVM arguments line to enable the security manager:

        <jvmarg line="-Djava.security.manager -Djava.security.policy=security.policy"/>

+   You can also provide a description of these tests to be included on result pages by assigning a value to `didit.desc`:

        <jvmarg value="-Ddidit.desc=Testing penup and pendown"/>

+   And you must set the test report formatter to write XML files:

        <formatter type="xml" usefile="true"/>

    Each `junit` task will generate a `TEST-packagename.ClassName.xml` file.

Finally, after all of their `junit` tasks, both `public` and `hidden` should generate a summary report called `TESTS-TestSuites.xml` with all the test results:
{% highlight xml %}
<junitreport>
    <fileset dir="." includes="TEST-*.xml"/>
</junitreport>
{% endhighlight %}

## Test payloads

You can generate test results with arbitrary payloads -- text or binary data -- that are accessible from build result pages on the web.

### Generating payload-only tests

Assuming `hello.png.gz.b64` is a [base64](http://en.wikipedia.org/wiki/Base64)-encoded gzipped PNG:

{% highlight xml %}
<loadfile property="payload.hello" srcFile="hello.png.gz.b64" failonerror="false"/>
<property name="payload.hello" value=""/>
<echoxml file="TEST-z-images.xml">
    <testsuite name="Images" tests="1" failures="0" errors="0">
        <properties>
            <property name="didit.desc" value="Images!"/>
        </properties>
        <testcase name="hello">
            <payload type="png.gz">${payload.hello}</payload>
        </testcase>
    </testsuite>
</echoxml>
{% endhighlight %}

This example generates a 'fake' test result file with a single passing test that will link to `hello.png`.

### Attaching payloads to JUnit tests

You can also deliver payloads attached to 'real' tests.
In `build.xml`:

{% highlight xml %}
<loadfile property="payload.hello" srcFile="hello.png.gz.b64" failonerror="false"/>
<property name="payload.hello" value=""/>
<xslt in="TEST-ps0.staff.TurtleTest.xml"
      out="TEST-ps0.staff.TurtleTest.out.xml"
      style="grader-proj/payloads.xslt"
      failOnError="false">
    <param name="hello" expression="${payload.hello}"/>
</xslt>
<move file="TEST-ps0.staff.TurtleTest.out.xml"
      tofile="TEST-ps0.staff.TurtleTest.xml"
      failonerror="false"/>
{% endhighlight %}

And in [XSLT](http://en.wikipedia.org/wiki/XSLT) stylesheet `payloads.xslt`:

{% highlight xml %}
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

    <xsl:param name="hello"></xsl:param>
    
    <xsl:template match="@*|node()">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()"/>
        </xsl:copy>
    </xsl:template>
    <xsl:template match="testcase[@name='testHelloImage']">
        <xsl:copy>
            <xsl:apply-templates select="@* | *"/>
            <payload type="png.gz"><xsl:value-of select="$hello"/></payload>
        </xsl:copy>
    </xsl:template>
</xsl:stylesheet>
{% endhighlight %}

This example adds `hello.png` as the payload for test `testHelloImage`.

## Manually-generated test results

You can run arbitrary tests using Ant tasks and include them in the test results and grade reports by generating XML result files by hand.

Use the `echoxml` Ant task.
For an example, see **[generating payload-only tests]** above.

[build security]: build-security.html
[run the build manually]: building-locally.html
[generating payload-only tests]: #generating-payload-only-tests
