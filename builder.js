var async = require('async');
var events = require('events');
var fs = require('fs');
var glob = require('glob');
var mkdirp = require('mkdirp');
var path = require('path');
var temp = require('temp');

var config = require('./config');
var decider = require('./decider');
var log = require('./logger').cat('builder');

var ant = require('./ant');
var git = require('./git');

function buildId(spec) {
  return [ 'build', config.student.semester, spec.kind, spec.proj, spec.users.join('-'), spec.rev ].join('-');
}

function buildJSONable(spec) {
  return { kind: spec.kind, proj: spec.proj, users: spec.users, rev: spec.rev };
}

function buildResultDir(spec, staffrev) {
  return path.join(
    config.build.results, config.student.semester,
    spec.kind, spec.proj, spec.users.join('-'), spec.rev, staffrev
  );
}

function buildResultFile(spec) {
  return path.join(buildResultDir(spec), 'result.json');
}

function buildOutputBase(spec, staffrev, target) {
  return path.join(buildResultDir(spec, staffrev), target);
}

// find all projects
exports.findProjectsSync = function() {
  return glob.sync(path.join(config.student.semester, '*', '*'), {
    cwd: config.build.results
  }).map(function(dir) {
    var parts = dir.split(path.sep);
    return { kind: parts[1], proj: parts[2] };
  });
}

// find all the repos matching a kind, project, and/or users
exports.findRepos = function(spec, callback) {
  var kind = spec.kind || '*';
  var proj = spec.proj || '*';
  var users = spec.users ? '?(*-)' + spec.users.join('-') + '?(-*)' : '*';
  log.info('findRepos', kind, proj, users);
  glob(path.join(config.student.semester, kind, proj, users), {
    cwd: config.build.results
  }, function(err, files) {
    callback(err, files.map(function(file) {
      var parts = file.split(path.sep);
      return { kind: parts[1], proj: parts[2], users: parts[3].split('-') }
    }));
  });
};

// find all builds of a repo by kind, project, and users
exports.findBuilds = function(spec, callback) {
  log.info({ spec: spec }, 'findBuilds');
  var dir = path.join(config.build.results, config.student.semester, spec.kind, spec.proj, spec.users.join('-'));
  glob('*/result.json', {
    cwd: dir
  }, function(err, files) {
    log.info('findBuilds', 'found', files);
    var revs = files.map(function(file) {
      return { rev: file.split(path.sep)[0], ctime: fs.statSync(path.join(dir, file)).ctime.getTime() };
    }).sort(function(a, b) {
      return b.ctime - a.ctime;
    }).map(function(data) {
      return { kind: spec.kind, proj: spec.proj, users: spec.users, rev: data.rev };
    });
    callback(err, revs);
  });
};

// find a build of a repo by kind, project, users, and revision
exports.findBuild = function(spec, callback) {
  log.info({ spec: spec }, 'findBuild');
  fs.readFile(buildResultFile(spec), function(err, data) {
    if (err) {
      err.dmesg = err.dmesg || 'error reading build result file';
      callback(err, null);
      return;
    }
    var result = JSON.parse(data);
    result.spec = buildJSONable(spec);
    result.txt = {};
    result.json = {};
    var dir = buildResultDir(spec, result.builder);
    glob('*.*', {
      cwd: dir
    }, function(err, files) {
      async.forEach(files, function(file, next) {
        fs.readFile(path.join(dir, file), function(err, data) {
          var targtype = file.split('.');
          result[targtype[1]][targtype[0]] = targtype[1] == 'json' ? JSON.parse(data) : data;
          next(err);
        });
      }, function(err) {
        callback(err, result);
      })
    })
  });
};

// start the build of a repo by kind, project, users, and revision
// callback returns a build id
exports.startBuild = function(spec, callback) {
  var path = [
    config.student.repos, config.student.semester, spec.kind, spec.proj, spec.users.join('-')
  ].join('/') + '.git';
  if ( ! fs.existsSync(path)) {
    log.error({ spec: spec }, 'startBuild no such repository');
    callback({ dmesg: 'no such repository' });
    return;
  }
  
  var id = buildId(spec);
  decider.startWorkflow(id, buildJSONable(spec), function(err) {
    if (err) {
      log.error(err, 'startBuild error');
      err.dmesg = err.dmesg || 'failed to start workflow';
    }
    callback(err, id);
  });
};

// obtain a build progress listener
exports.monitor = function(id) {
  var mon = new events.EventEmitter();
  function report(event, data) {
    log.info('monitor', id, event, data);
    mon.emit(event, data);
  }
  decider.on(id, report);
  mon.cancel = function() {
    log.info('monitor', id, 'cancelling')
    decider.removeListener(id, report);
  };
  return mon;
};

// run the build
// stores results and returns them in the callback
exports.build = function(spec, progressCallback, resultCallback) {
  log.info({ spec: spec }, 'build');
  var started = +new Date();
  async.auto({
    builddir: async.apply(temp.mkdir, 'didit-'),
    source: [ 'builddir', function(next, results) {
      git.cloneStudentSource(spec, results.builddir, next);
    } ],
    builder: [ 'source', function(next, results) {
      git.fetchBuilder(spec, results.builddir, next);
    } ],
    builderProgress: [ 'builder', function(next, results) {
      progressCallback('Checked out rev ' + results.source.rev);
      next();
    } ],
    resultdir: [ 'builder', function(next, results) {
      mkdirp(buildResultDir(spec, results.builder), next);
    } ],
    compile: [ 'resultdir', function(next, results) {
      ant.compile(spec, results.builddir, 'compile', buildOutputBase(spec, results.builder, 'compile'), next);
    } ],
    compileProgress: [ 'compile', function(next, results) {
      if ( ! results.compile) {
        progressCallback('Compilation error');
      }
      next();
    } ],
    public: [ 'compile', function(next, results) {
      ant.test(spec, results.builddir, 'public', buildOutputBase(spec, results.builder, 'public'), next);
    } ],
    hidden: [ 'public', function(next, results) {
      ant.test(spec, results.builddir, 'hidden', buildOutputBase(spec, results.builder, 'hidden'), next);
    } ]
  }, function(err, results) {
    log.info('build complete');
    results = results || {};
    if (err) {
      log.error(err, 'build error');
      err.dmesg = err.dmesg || 'unknown build error';
      results.err = err;
    }
    results.started = started;
    results.finished = +new Date();
    fs.writeFile(buildResultFile(spec), JSON.stringify(results), function(fserr) {
      if (fserr) { log.error({ err: fserr, results: results }, 'error writing results'); }
      resultCallback(err || fserr, results);
    });
  });
}

// command-line build
if (require.main === module) {
  var args = process.argv.slice(2);
  log.info('manual build', args);
  exports.build({
    kind: args[0], proj: args[1], users: args[2].split('-'), rev: args[3]
  }, function(progress) {
    log.info({ progress: progress }, 'progress');
  }, function(err, result) {
    if (err) { log.error(err, 'error'); }
    log.info(result, 'result');
  });
}
