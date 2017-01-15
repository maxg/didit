const async = require('async');
const fs = require('fs');
const fsextra = require('fs-extra');
const glob = require('glob');
const moment = require('moment');
const path = require('path');

const config = require('./config');
const builder = require('./builder');
const git = require('./git');
const log = require('./logger').cat('sweeper');

function shuffle(ordered) {
  if (ordered.length == 0) { return []; }
  let shuffled = [ ordered[0] ];
  for (let ii = 1; ii < ordered.length; ii++) {
    let jj = Math.floor(Math.random() * (ii+1));
    shuffled[ii] = shuffled[jj];
    shuffled[jj] = ordered[ii];
  }
  return shuffled;
}

function sweepResultDir(spec, when) {
  return path.join(
    config.build.results, 'sweeps', spec.kind, spec.proj, when.format(moment.compactFormat)
  );
}

function sweepResultFile(spec, when, name) {
  return path.join(sweepResultDir(spec, when), name + '.json');
}

// find sweeps by kind and project
exports.findSweeps = function(spec, callback) {
  log.info({ spec }, 'findSweeps');
  let kind = spec.kind || config.glob.kind;
  let proj = spec.proj || '*';
  glob(path.join('sweeps', kind, proj, '*', 'sweep.json'), {
    cwd: config.build.results
  }, function(err, files) {
    if (err) {
      err.dmesg = err.dmesg || 'error finding sweeps';
      callback(err);
      return;
    }
    callback(err, files.map(function(file) {
      let parts = file.split(path.sep);
      return { kind: parts[1], proj: parts[2], when: moment(parts[3], moment.compactFormat) };
    }));
  });
};

// find a sweep by kind, project, and time
exports.findSweep = function(params, callback) {
  log.info({ params }, 'findSweep');
  fs.readFile(sweepResultFile(params, params.datetime, 'sweep'), { encoding: 'utf8' }, function(err, data) {
    if (err) {
      log.error({ params }, 'error reading sweep result file');
      callback(err, null);
      return;
    }
    let result;
    try {
      result = JSON.parse(data);
    } catch(err) {
      log.error({ err, params, file: 'sweep' });
      callback(err);
      return;
    }
    fs.readFile(sweepResultFile(params, params.datetime, 'grades'), function(err, data) {
      if ( ! data) {
        callback(null, result);
        return;
      }
      let grades;
      try {
        grades = JSON.parse(data);
      } catch(err) {
        log.error({ err, params, file: 'grades' });
        callback(err);
        return;
      }
      async.forEach(result.reporevs, function(reporev, next) {
        async.detect(grades, function(grade, found) {
          found(null, grade && grade.spec.rev == reporev.rev && grade.spec.users.join('-') == reporev.users.join('-'));
        }, function(err, grade) {
          reporev.grade = grade;
          next();
        });
      }, function(err) {
        callback(err, result);
      });
    });
  });
};

let scheduledSweepTimers = [];

// schedule a sweep for the given kind and project at a past or future time; see startSweep(...)
// scheduleCallback returns synchronously
exports.scheduleSweep = function(spec, when, scheduleCallback, startCallback, finishCallback) {
  log.info({ spec, when }, 'scheduleSweep');
  if (when.isAfter(moment().add(14, 'days'))) {
    scheduleCallback({ dmesg: 'cannot schedule sweep so far in the future' });
    return;
  }
  let timer = setTimeout(function() {
    exports.startSweep(spec, when, function(err, repos) {
      scheduledSweepTimers.splice(scheduledSweepTimers.indexOf(timer), 1);
      if (startCallback) { startCallback(err, repos); }
    }, finishCallback || function() {});
  }, when.diff(moment()));
  timer.sweep = { kind: spec.kind, proj: spec.proj, when };
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
  log.info({ spec }, 'startSweep');
  let started = +new Date();
  async.auto({
    resultdir(next) {
      fsextra.mkdirs(sweepResultDir(spec, when), next);
    },
    placeholder: [ 'resultdir', function(results, next) {
      fs.writeFile(sweepResultFile(spec, when, 'sweep'), JSON.stringify({
        spec,
        when: +when,
        started,
        reporevs: []
      }), function(err) {
        if (err) { log.error({ err, spec, when, file: 'sweep' }); }
        next();
      });
    } ],
    repos: [ 'placeholder', function(results, next) {
      git.findStudentRepos(spec, function(err, repos) {
        startCallback(err, repos);
        next(err, repos);
      });
    } ],
    revisions: [ 'repos', function(results, next) {
      async.eachLimit(shuffle(results.repos), config.build.concurrency || 2, function(spec, next) {
        git.studentSourceRevAt(spec, when, function(err, rev) {
          if (err) {
            log.warn({ spec }, 'error getting revision');
          } else {
            log.info({ spec }, 'got revision', rev);
          }
          spec.rev = rev || null;
          next();
        });
      }, function(err) { next(err); });
    } ],
    sorted: [ 'revisions', function(results, next) {
      async.sortBy(results.repos, function(reporev, use) {
        use(null, (config.staff.users.indexOf(reporev.users[0]) < 0 ? '-' : '') + reporev.users.join('-'));
      }, function(err, reporevs) {
        next(err, reporevs);
      });
    } ],
    record: [ 'sorted', function(results, next) {
      fs.writeFile(sweepResultFile(spec, when, 'sweep'), JSON.stringify({
        spec,
        when: +when,
        started,
        finished: +new Date(),
        reporevs: results.sorted
      }), function(err) { next(err); });
    } ],
    builder: async.apply(git.builderRev, spec),
    buildAndGrade: [ 'record', 'builder', function(results, next) {
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
  log.info({ params }, 'rebuildSweep');
  git.builderRev(params, function(err, staffrev) {
    buildSweep(params, params.datetime, staffrev, finishCallback || function() {});
    startCallback(err);
  });
};

function buildSweep(spec, when, staffrev, callback) {
  log.info({ spec, when, staffrev }, 'buildSweep');
  async.auto({
    sweep: async.apply(exports.findSweep, { kind: spec.kind, proj: spec.proj, datetime: when }),
    promises: [ 'sweep', function(results, next) {
      async.mapSeries(results.sweep.reporevs, function(spec, set) {
        promiseBuild(spec, staffrev, set);    // repo -> promised build
      }, function(err, promises) { next(err, promises); });
    } ],
    builds: [ 'promises', function(results, next) {
      async.mapSeries(results.promises, function(promise, set) {
        promise(function(err, build) {
          if ( ! build) {
            log.warn({ err }, 'sweeping build error');
          }
          set(null, build);                   // promised build -> build
        });
      }, function(err, builds) { next(err, builds); });
    } ],
    grade: [ 'builds', function(results, next) {
      async.map(results.builds, function(build, set) {
        if ( ! (build && build.json.grade)) {
          log.warn({ build }, 'missing grade');
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
  log.info({ spec, hours }, 'scheduleCatchups');
  async.auto({
    repos: async.apply(git.findStudentRepos, spec),
    schedule: [ 'repos', function(results, next) {
      let delay = hours * 60 * 60 * 1000 / (results.repos.length - 1);
      shuffle(results.repos).forEach(function(spec, idx) {
        log.info({ spec, delay: delay * idx }, 'scheduling catch-up')
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
  log.info({ spec }, 'promiseCurrentBuild');
  async.auto({
    revision: async.apply(git.studentSourceRev, spec),
    builder: async.apply(git.builderRev, spec),
    promise: [ 'revision', 'builder', function(results, next) {
      spec.rev = results.revision || null;
      promiseBuild(spec, results.builder, next);
    } ]
  }, function(err, results) {
    if (err) { log.error({ err, spec }, 'error promising current build'); }
    callback(err, results.promise);
  });
}

function promiseBuild(spec, staffrev, callback) {
  log.info({ spec }, 'promiseBuild');
  if ( ! spec.rev) {
    log.warn({ spec }, 'no revision to build');
    callback(null, function(f) { f(null, null); });
    return;
  }
  
  builder.findBuild(spec, function(err, build) {
    if (build && build.builder == staffrev) {
      log.info({ spec }, 'already built with', staffrev);
      callback(null, function(f) { f(null, build); });
      return;
    }
    
    log.info({ spec }, 'need to build with', staffrev);
    builder.startBuild(spec, function(err, buildId) {
      if (err) {
        log.error({ err, spec }, 'error starting build');
        callback(null, function(f) { builder.findBuild(spec, f); });
        return;
      }
      let done = false;
      let monitor = builder.monitor(buildId);
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
