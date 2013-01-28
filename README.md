Didit
=====

**The Classroom Continuous Build Butler**

A continuous build server designed for the classroom. Uses the [Amazon Simple Workflow Service][SWF] to manage asynchronous builds. Results are stored in the filesystem.

  [SWF]: http://aws.amazon.com/swf/


Git Repositories
----------------

Student repositories must be organized in the `config.student.repos` directory under `<semester>/<kind>/<proj>/<users>.git`. In each repository, `hooks/update` should symlink to Didit's `hooks/update` script.

The staff repository must store build materials under `<semester>/<kind>/<proj>/grading`.


Development
-----------

Install [VirtualBox] and [Vagrant].

  [VirtualBox]: http://www.virtualbox.org/
  [Vagrant]: http://www.vagrantup.com/

`vagrant up` should download, configure, and provision the VM. Use `vagrant ssh` to log in. The `/vagrant` directory gives the VM read/write access to the project.

Fill in `config/aws.json` with AWS authentication keys.

Fill in `config/development.js` with development settings.

In `/vagrant`...

 * `node web`: start the web front-end and build workflow decider
 * `node worker`: start a build worker
 * `node builder <kind> <proj> <users> <rev>`: run a build manually

In a student repository, simulate a push:

    GIT_DIR=. hooks/update refs/heads/master <oldrev> <newrev>

`<oldrev>` can be `0000000`, or use e.g.:

    git rev-parse HEAD^ HEAD | GIT_DIR=. xargs hooks/update refs/heads/master


Deployment
----------

On CSAIL VMs...

 * Modify `/etc/csail/users.allow` to restrict machine login access
 * Create UNIX user `didit` with a `/bin/nologin` shell
 * Obtain an AFS user `didit.<hostname>` and a Kerberos keytab from TIG

Run `manifests/csail.sh` to set up the VM.

Fill in configuration files as above, but use `config/production.js`.

In `/var/didit`...

 * `bin/daemon start web` (or `worker`)
 * `bin/daemon stop`


Resources
---------

 * Amazon Simple Workflow Service
   * [Developer Guide](http://docs.aws.amazon.com/amazonswf/latest/developerguide/)
   * [API Reference](http://docs.aws.amazon.com/amazonswf/latest/apireference/)
   * [SDK for Node.js](http://aws.amazon.com/sdkfornodejs/), [API documentation](http://docs.amazonwebservices.com/AWSJavaScriptSDK/latest/frames.html)
   * [SWF Management Console](https://console.aws.amazon.com/swf/home)
 * [Apache Ant](http://ant.apache.org/manual/)
 * [Bootstrap front-end framework](http://twitter.github.com/bootstrap/scaffolding.html)
 * Java security policy [permissions](http://download.java.net/jdk8/docs/technotes/guides/security/permissions.html) and [syntax](http://download.java.net/jdk8/docs/technotes/guides/security/PolicyFiles.html)
 * Node.js
   * [Manual](http://nodejs.org/api/)
   * [Mozilla JavaScript Reference](https://developer.mozilla.org/en-US/docs/JavaScript/Reference)
   * [Async utilities](https://npmjs.org/package/async)
   * [Express web app framework](http://expressjs.com/)
   * [Jade template engine](https://github.com/visionmedia/jade)
