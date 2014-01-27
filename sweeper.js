var async = require('async');
var fs = require('fs');
var glob = require('glob');
var mkdirp = require('mkdirp');
var moment = require('moment');
var path = require('path');

var config = require('./config');
var builder = require('./builder');
var git = require('./git');
var log = require('./logger').cat('sweeper');

function shuffle(ordered) {
  if (ordered.length == 0) { return []; }
  var shuffled = [ ordered[0] ];
  for (var ii = 1; ii < ordered.length; ii++) {
    var jj = Math.floor(Math.random() * (ii+1));
    shuffled[ii] = shuffled[jj];
    shuffled[jj] = ordered[ii];
  }
  return shuffled;
}

function sweepResultDir(spec, when) {
  return path.join(
    config.build.results, 'sweeps', config.student.semester,
    spec.kind, spec.proj, when.format(moment.compactFormat)
  );
}

function sweepResultFile(spec, when, name) {
  return path.join(sweepResultDir(spec, when), name + '.json');
}

// find sweeps by kind and project
exports.findSweeps = function(spec, callback) {
  log.info({ spec: spec }, 'findSweeps');
  var kind = spec.kind || '*';
  var proj = spec.proj || '*';
  glob(path.join('sweeps', config.student.semester, kind, proj, '*', 'sweep.json'), {
    cwd: config.build.results
  }, function(err, files) {
    callback(err, files.map(function(file) {
      var parts = file.split(path.sep);
      return { kind: parts[2], proj: parts[3], when: moment(parts[4], moment.compactFormat) };
    }));
  });
};

// find a sweep by kind, project, and time
exports.findSweep = function(params, callback) {
  log.info({ params: params }, 'findSweep');
  fs.readFile(sweepResultFile(params, params.datetime, 'sweep'), { encoding: 'utf8' }, function(err, data) {
    if (err) {
      log.error({ params: params }, 'error reading sweep result file');
      callback(err, null);
      return;
    }
    try {
      var result = JSON.parse(data);
    } catch(err) {
      log.error(err, { params: params, file: 'sweep' });
      callback(err);
      return;
    }
    fs.readFile(sweepResultFile(params, params.datetime, 'grades'), function(err, data) {
      if ( ! data) {
        callback(null, result);
        return;
      }
      try {
        var grades = JSON.parse(data);
      } catch(err) {
        log.error(err, { params: params, file: 'grades' });
        callback(err);
        return;
      }
      async.forEach(result.reporevs, function(reporev, next) {
        async.detect(grades, function(grade, found) {
          found(grade && grade.spec.rev == reporev.rev && grade.spec.users.join('-') == reporev.users.join('-'));
        }, function(grade) {
          reporev.grade = grade;
          next();
        });
      }, function(err) {
        callback(err, result);
      });
    });
  });
};

var scheduledSweepTimers = [];

// schedule a sweep for the given kind and project at a past or future time; see startSweep(...)
// scheduleCallback returns synchronously
exports.scheduleSweep = function(spec, when, scheduleCallback, startCallback, finishCallback) {
  log.info({ spec: spec, when: when }, 'scheduleSweep');
  if (when.isAfter(moment().add(14, 'days'))) {
    scheduleCallback({ dmesg: 'cannot schedule sweep so far in the future' });
    return;
  }
  var timer = setTimeout(function() {
    exports.startSweep(spec, when, function(err, repos) {
      scheduledSweepTimers.splice(scheduledSweepTimers.indexOf(timer), 1);
      if (startCallback) { startCallback(err, repos); }
    }, finishCallback || function() {});
  }, when.diff(moment()));
  timer.sweep = { kind: spec.kind, proj: spec.proj, when: when };
  scheduledSweepTimers.push(timer);
  scheduleCallback();
};

// find scheduled sweeps by kind and project
exports.scheduledSweeps = function(spec, callback) {
  callback(null, scheduledSweepTimers.filter(function(timer) {
    return timer.sweep.kind == spec.kind && timer.sweep.proj == spec.proj;
  }).map(function(timer) { return timer.sweep; }));
};

// start a sweep for the given kind and project as of the given time
// startCallback returns the list of student repos that will be swept
// finishCallback returns the grade report from the sweep
exports.startSweep = function(spec, when, startCallback, finishCallback) {
  log.info({ spec: spec }, 'startSweep');
  var started = +new Date();
  async.auto({
    resultdir: function(next) {
      mkdirp(sweepResultDir(spec, when), next);
    },
    placeholder: [ 'resultdir', function(next, results) {
      fs.writeFile(sweepResultFile(spec, when, 'sweep'), JSON.stringify({
        spec: spec,
        when: +when,
        started: started,
        reporevs: []
      }), function(err) {
        if (err) { log.error(err, { spec: spec, when: when, file: 'sweep' }); }
        next();
      });
    } ],
    repos: [ 'placeholder', function(next) {
      git.findStudentRepos(spec, function(err, repos) {
        startCallback(err, repos);
        next(err, repos);
      });
    } ],
    revisions: [ 'repos', function(next, results) {
      async.eachLimit(shuffle(results.repos), config.build.concurrency || 2, function(spec, next) {
        git.studentSourceRevAt(spec, when, function(err, rev) {
          if (err) {
            log.warn({ spec: spec }, 'error getting revision');
          } else {
            log.info({ spec: spec }, 'got revision', rev);
          }
          spec.rev = rev || null;
          next();
        });
      }, function(err) { next(err); });
    } ],
    record: [ 'revisions', function(next, results) {
      fs.writeFile(sweepResultFile(spec, when, 'sweep'), JSON.stringify({
        spec: spec,
        when: +when,
        started: started,
        finished: +new Date(),
        reporevs: results.repos
      }), function(err) { next(err); });
    } ],
    builder: async.apply(git.builderRev, spec),
    buildAndGrade: [ 'record', 'builder', function(next, results) {
      buildSweep(spec, when, results.builder, next);
    } ]
  }, function(err, results) {
    if (err) { log.error(err, 'sweeping error'); }
    finishCallback(err, results.buildAndGrade);
  });
};

// rebuild a sweep given kind, project, and time
// startCallback returns immediately
// finishCallback returns the new grade report
exports.rebuildSweep = function(params, startCallback, finishCallback) {
  log.info({ params: params }, 'rebuildSweep');
  git.builderRev(params, function(err, staffrev) {
    buildSweep(params, params.datetime, staffrev, finishCallback || function() {});
    startCallback(err);
  });
};

function buildSweep(spec, when, staffrev, callback) {
  log.info({ spec: spec, when: when, staffrev: staffrev }, 'buildSweep');
  async.auto({
    sweep: async.apply(exports.findSweep, { kind: spec.kind, proj: spec.proj, datetime: when }),
    promises: [ 'sweep', function(next, results) {
      async.mapSeries(results.sweep.reporevs, function(spec, set) {
        promiseBuild(spec, staffrev, set);    // repo -> promised build
      }, function(err, promises) { next(err, promises); });
    } ],
    builds: [ 'promises', function(next, results) {
      async.mapSeries(results.promises, function(promise, set) {
        promise(function(err, build) {
          if ( ! build) {
            log.warn({ err: err }, 'sweeping build error');
          }
          set(null, build);                   // promised build -> build
        });
      }, function(err, builds) { next(err, builds); });
    } ],
    grade: [ 'builds', function(next, results) {
      async.map(results.builds, function(build, set) {
        if ( ! (build && build.json.grade)) {
          log.warn({ build: build }, 'missing grade');
        }
        set(null, build && build.json.grade); // build -> grade report
      }, function(err, grades) {
        fs.writeFile(sweepResultFile(spec, when, 'grades'),
                     JSON.stringify(grades),
                     function(err) { next(err, grades); });
      });
    } ]
  }, function(err, results) {
    if (err) { log.error(err, 'sweeping build error'); }
    callback(err, results.grade);
  });
}

// schedule catch-up builds over the given interval
exports.scheduleCatchups = function(spec, hours, callback) {
  log.info({ spec: spec, hours: hours }, 'scheduleCatchups');
  async.auto({
    repos: async.apply(git.findStudentRepos, spec),
    schedule: [ 'repos', function(next, results) {
      var delay = hours * 60 * 60 * 1000 / (results.repos.length - 1);
      shuffle(results.repos).forEach(function(spec, idx) {
        log.info({ spec: spec, delay: delay * idx }, 'scheduling catch-up')
        setTimeout(function() {
          promiseCurrentBuild(spec, function() {});
        }, delay * idx);
      });
      next();
    } ]
  }, function(err) {
    if (err) { log.error(err, 'catch-up error'); }
    callback(err);
  });
};

function promiseCurrentBuild(spec, callback) {
  log.info({ spec: spec }, 'promiseCurrentBuild');
  async.auto({
    revision: async.apply(git.studentSourceRev, spec),
    builder: async.apply(git.builderRev, spec),
    promise: [ 'revision', 'builder', function(next, results) {
      spec.rev = results.revision || null;
      promiseBuild(spec, results.builder, next);
    } ]
  }, function(err, results) {
    if (err) { log.error({ err: err, spec: spec }, 'error promising current build'); }
    callback(err, results.promise);
  });
}

function promiseBuild(spec, staffrev, callback) {
  log.info({ spec: spec }, 'promiseBuild');
  if ( ! spec.rev) {
    log.warn({ spec: spec }, 'no revision to build');
    callback(null, function(f) { f(null, null); });
    return;
  }
  
  builder.findBuild(spec, function(err, build) {
    if (build && build.builder == staffrev) {
      log.info({ spec: spec }, 'already built with', staffrev);
      callback(null, function(f) { f(null, build); });
      return;
    }
    
    log.info({ spec: spec }, 'need to build with', staffrev);
    builder.startBuild(spec, function(err, buildId) {
      if (err) {
        log.error({ err: err, spec: spec }, 'error starting build');
        callback(null, function(f) { builder.findBuild(spec, f); });
        return;
      }
      var done = false;
      var monitor = builder.monitor(buildId);
      monitor.once('done', function() { done = true; });
      monitor.once('failed', function() { done = true; });
      callback(null, function(f) {
        if ( ! done) {
          monitor.once('done', function() { builder.findBuild(spec, f); });
          monitor.once('failed', function() { builder.findBuild(spec, f); });
        } else {
          builder.findBuild(spec, f);
        }
      });
    });
  });
}
