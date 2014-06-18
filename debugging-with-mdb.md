# Debugging with `mdb`

Even when running on Linux, it is possible to debug `node` memory issues using [`mdb`, the illumos debugger][mdb]: [MDB and Linux][mdb-linux].

0. Generate a core dump of the `node` process using `gcore`.

0. [Install the Manta utilities][install].
   Even if they conflict with existing binaries, the commands can be run directly from `/usr/lib/node_modules/manta/bin/`. 

0. Copy the `node` binary and the `core` file into a `debug` directory.

0. Per the installation instructions, [export Manta environment vars][environment].

   Upload `node` and `core` using `mput`:
   
   `tar cz debug | mput ~~/stor/debug.tar.gz`

0. Follow the instructions to [create and run `mmdb.sh`][mdb-linux]:

   `./mmdb.sh ~~/stor/debug.tar.gz`

In `mdb`, [use `::findjsobjects` and `::jsprint` to navigate and print objects][findjsobjects]:

+ Use `::findjsobjects` to find one representative of every kind of object

+ Use `abcd1234::findjsobjects | ::findjsobjects` to find all objects like `abcd1234`

+ Use `abcd1234::findjsobjects -r` to find all objects with a reference to `abcd1234`

Inspect stack frames and functions using [`::jsframe`, `::v8print` and other commands][mdb-js-and-v8]:

+ `::jsprint` doesn't say much about function objects; use `::v8print` first on the function and then on the associated `SharedFunctionInfo`

[mdb]: http://www.joyent.com/developers/node/debug/mdb
[mdb-linux]: http://www.joyent.com/blog/mdb-and-linux
[install]: http://apidocs.joyent.com/manta/#if-you-have-nodejs-installed]
[environment]: http://apidocs.joyent.com/manta/#setting-up-your-environment
[findjsobjects]: http://dtrace.org/blogs/bmc/2012/05/05/debugging-node-js-memory-leaks/
[mdb-js-and-v8]: http://dtrace.org/blogs/dap/2012/01/13/playing-with-nodev8-postmortem-debugging/
