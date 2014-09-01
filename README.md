Didit
=====

**The Classroom Continuous Build Butler**

A continuous build server designed for the classroom. Uses the [Amazon Simple Workflow Service][SWF] to manage asynchronous builds. Results are stored in the filesystem.

  [SWF]: http://aws.amazon.com/swf/


Git Repositories
----------------

Student repositories must be organized in the `config.student.repos` directory under `<semester>/<kind>/<proj>/<users>.git`. In each repository, `hooks/post-receive` should copy or symlink Didit's `hooks/post-receive` script.

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

    echo <oldrev> <newrev> refs/heads/master | GIT_DIR=. hooks/post-receive

`<oldrev>` can be `0000000`, or use e.g.:

    echo `git rev-parse HEAD^1 HEAD` refs/heads/master | GIT_DIR=. hooks/post-receive


AWS
---

Didit relies on:

 * AWS **Simple Workflow Service** to drive the build workflow.
   A workflow domain must be configured in the SWF console before running Didit.
 * AWS **Simple Email Service** (optionally) to send emails.
   The sender DNS domain must be verified in the SES console before sending email.


Deployment
----------

To build virtual machine images, install [Packer]. On OS X, use `brew install homebrew/binary/packer`.

  [Packer]: http://www.packer.io/

Fill in `manifests/packer.conf.json`.

Run `bin/pack <rev> [opts]` to build images using Packer:

 * If `<rev>` is `--working`, working-copy versions of tracked files will be packed
 * Use `-only=openstack` or similar to build only certain images

To manage OpenStack instances, install the [OpenStack CLI]. In the Vagrant VM, use `apt-get install python-pip`, `pip install python-novaclient python-cinderclient`. Then use `bin/openstack` to run commands with credentials.

  [OpenStack CLI]: http://docs.openstack.org/user-guide/content/ch_cli.html

The script automates common operations, including:

 * `preflight`: gather information for starting instances
 * `launch`: start a new instance

After starting a new instance, use `bin/productionize` to copy configuration files from `prod`:

 * Use `production.js`
 * For a web front-end, use a production SSL certificate
 * On AFS, use a production Kerberos keytab `didit.keytab` (in CSAIL, obtain an AFS user and keytab from TIG)

On an instance, in `/var/didit`...

 * `bin/daemon start web` (or `worker`)
 * `bin/daemon stop`


Resources
---------

 * Amazon Simple Email Service
   * [SES Management Console](https://console.aws.amazon.com/ses/home)
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
 * OpenStack
   * [End User Guide](http://docs.openstack.org/user-guide/content/)
