Didit
=====

**The Classroom Continuous Build Butler**

A continuous build server designed for the classroom. Uses the [Amazon Simple Workflow Service][SWF] to manage asynchronous builds. Results are stored in the filesystem.

  [SWF]: http://aws.amazon.com/swf/


Git Repositories
----------------

Student repositories must be organized in the `config.student.repos` directory under `<kind>/<proj>/<users>.git`. In each repository, `hooks/post-receive` should copy or symlink Didit's `hooks/post-receive` script.

The staff repository at `config.staff.repo` must store build materials in the `config.staff.base` directory, under `<kind>/<proj>/grading`.


Development
-----------

Install [VirtualBox] and [Vagrant].

  [VirtualBox]: http://www.virtualbox.org/
  [Vagrant]: http://www.vagrantup.com/

`vagrant up` should download, configure, and provision the VM. Use `vagrant ssh` to log in. The `/vagrant` directory gives the VM read/write access to the project.

Fill in `config/aws.json` with AWS authentication keys.

Fill in `config/development.js` with development settings.

In `/vagrant`...

 * `node src/web`: start the web front-end and build workflow decider
 * `node src/worker`: start a build worker
 * `node src/builder <kind> <proj> <users> <rev>`: run a build manually

In a student repository, simulate a push:

    echo <oldrev> <newrev> refs/heads/master | GIT_DIR=. hooks/post-receive

`<oldrev>` can be `0000000`, or use e.g.:

    echo `git rev-parse HEAD^1 HEAD` refs/heads/master | GIT_DIR=. hooks/post-receive

To use AFS:

 * Install packages: `sudo apt-get install krb5-user openafs-client openafs-krb5 module-assistant` (for Athena: realm `ATHENA.MIT.EDU`, cell `athena.mit.edu`)
 * And the kernel module: `sudo m-a prepare`, `sudo m-a auto-install openafs`, `sudo modprobe openafs`, `sudo service openafs-client restart`
 * Then `kinit <username>@<REALM>` and `aklog`


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

Fill in `setup/packer.conf.json`.

Run `bin/pack <rev> [opts]` to build images using Packer:

 * If `<rev>` is `--working`, working-copy versions of tracked files will be packed
 * Use `-only=openstack` or similar to build only certain images

To manage OpenStack instances, install the [OpenStack CLI]. In the Vagrant VM, use `apt-get install python-pip`, `pip install python-novaclient python-cinderclient`. Then use `bin/openstack` to run commands with credentials.

  [OpenStack CLI]: http://docs.openstack.org/user-guide/content/ch_cli.html

The script automates common operations, including `launch` to start a new instance.

After starting a new instance, use `bin/productionize` to copy configuration files from `prod`:

 * Use `production.js`
 * For a web front-end, use a production SSL certificate
 * On AFS, use a production Kerberos keytab `didit.keytab` (in CSAIL, obtain an AFS user and keytab from TIG)

On an instance, in `/var/didit`...

 * `bin/daemon start src/web` (or `src/worker`)
 * `bin/daemon stop`

See `src/monitor.js` for a simple monitoring app designed for use on [Heroku] to send alerts via SES:

 * Create an application and add the [Heroku Scheduler] add-on
 * Set [configuration variables][Heroku config vars]:
   * `AWS_ACCESS_KEY` and `AWS_SECRET_KEY` for SES
   * `DIDIT` = `https://.../`
   * `SENDER` = `alert-no-reply@...`
   * `RECIPIENT` will receive alert emails
 * Then create a scheduled job with the command `node src/monitor`

  [Heroku]: https://www.heroku.com/
  [Heroku Scheduler]: https://addons.heroku.com/scheduler
  [Heroku config vars]: https://devcenter.heroku.com/articles/config-vars


Resources
---------

 * Amazon Simple Email Service
   * [SES Management Console](https://console.aws.amazon.com/ses/home)
 * Amazon Simple Workflow Service
   * [Developer Guide](http://docs.aws.amazon.com/amazonswf/latest/developerguide/)
   * [API Reference](http://docs.aws.amazon.com/amazonswf/latest/apireference/)
   * [SDK for Node.js](https://aws.amazon.com/sdk-for-node-js/), [API documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/)
   * [SWF Management Console](https://console.aws.amazon.com/swf/home)
 * [Apache Ant](http://ant.apache.org/manual/)
 * [Bootstrap front-end framework](http://getbootstrap.com/css/)
 * Java security policy [permissions](http://download.java.net/jdk8/docs/technotes/guides/security/permissions.html) and [syntax](http://download.java.net/jdk8/docs/technotes/guides/security/PolicyFiles.html)
 * Node.js
   * [Manual](http://nodejs.org/api/)
   * [Mozilla JavaScript Reference](https://developer.mozilla.org/en-US/docs/JavaScript/Reference)
   * [Async utilities](https://npmjs.org/package/async)
   * [Express web app framework](http://expressjs.com/)
   * [Pug template engine](https://github.com/pugjs/pug)
 * OpenStack
   * [End User Guide](http://docs.openstack.org/user-guide/content/)
