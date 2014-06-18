---
title: Build security
subtitle: Didit does not automatically provide security
category: user
---

# Build security

**Didit does not implement any security or sandboxing features for running student code.**

You, the author of `build.xml` and other grading material, are responsible for making a build secure.

## Secure Java builds

Both the `public` and `hidden` targets should depend on a `test-clean` target:

{% highlight xml %}
<target name="test-clean">
    <delete>
        <fileset dir="." includes="TEST*.xml"/>
    </delete>
    
    <delete><fileset file="security.policy"/></delete>
    <echo file="security.policy">
        ...
    </echo>
</target>
{% endhighlight %}

This target removes any existing Ant JUnit test reports and creates a fresh [Java security policy](http://docs.oracle.com/javase/8/docs/technotes/guides/security/permissions.html) file.

In the security policy:

+ Allow the JRE and JUnit to work:

      grant codebase "file:${ant.library.dir}/-" {
          permission java.security.AllPermission;
      };
      grant codebase "file:${eclipse.home}/-" {
          permission java.security.AllPermission;
      };
      grant codebase "file:/usr/share/java/-" {
          permission java.security.AllPermission;
      };

+ If staff tests are compiled to `bin-test`, they might need special permissions:

      grant codebase "file:${basedir}/bin-tests/-" {
          permission java.net.SocketPermission "127.0.0.1", "connect";
      };

+ And student code might be granted some permissions:

      grant {
          permission java.io.FilePermission "./src/-", "read";
          permission java.io.FilePermission "./bin-tests/autograder/resources/-", "read";
          permission java.net.SocketPermission "127.0.0.1:4000-", "accept,listen";
      };

However, **do not allow student code to read or write `./`, `./-`, or other un-prefixed paths.**
Students will be able to read test code or resources, write bogus test results, or commit other nefarious trickery.

Finally, enable the security manager and use the security policy when you run Java.
For example:

{% highlight xml %}
<junit fork="yes" timeout="5000">
    <jvmarg line="-Djava.security.manager -Djava.security.policy=security.policy"/>
    ...
</junit>
{% endhighlight %}
