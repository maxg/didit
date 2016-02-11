var async = require('async');
var csv = require('csv');
var fs = require('fs');
var glob = require('glob');
var mkdirp = require('mkdirp');
var path = require('path');

var config = require('./config');
var git = require('./git');
var util = require('./util');
var log = require('./logger').cat('grader');

// parse a CSV grade sheet
exports.parseGradeSheet = function(filename, callback) {
  var sheet = csv().from.path(filename);
  sheet.transform(function(row) {
    if (row[0] == 'junit') { // "junit" rows define graded tests
      return { pkg: row[1], cls: row[2], test: row[3], pts: row[4] };
    } else {                 // skip other rows
      return null;
    }
  });
  sheet.to.array(function(rows) { callback(null, rows.filter(function(row) {
    return ! (row instanceof Array);
  })); });
  sheet.on('error', function(err) { callback(err); });
};

// assign points given by "row" based on results of "test"
function gradeTest(row, test) {
  var pass = test && ! (test.missing || test.failure || test.error);
  var outof = +row.pts;
  var score = pass ? outof : 0;
  return { pass: pass, score: score, outof: outof };
}

// read grade sheet and grade the results of hidden tests
// callback returns grade report
exports.grade = function(spec, builddir, build, output, callback) {
  log.info({ spec: spec }, 'grade');
  
  var report = {
    spec: spec,
    score: 0,
    outof: 0,
    testsuites: [],
    ungraded: []
  };
  
  var sheet = path.join(builddir, 'grade.csv');
  if ( ! fs.existsSync(sheet)) {
    log.info('not reading missing grade sheet');
    callback(null, report);
    return;
  }
  exports.parseGradeSheet(sheet, function(err, rows) {
    if (err) {
      log.error(err, 'parseGradeSheet error');
      callback(null, report);
      return;
    }
    var testsuites = (
      build.json.hidden && build.json.hidden.testsuites || []).concat(
      build.json.public && build.json.public.testsuites || []);
    async.eachSeries(rows, function(row, next) {
      var graded = row.pts.trim().length > 0;
      var reporttarget = graded ? report.testsuites : report.ungraded;
      async.auto({
        reportsuite: function(next) { // find the test suite in the report
          next(null, util.arrayFind(reporttarget, function(suite) {
            return suite.package == row.pkg && suite.name == row.cls;
          }).value);
        },
        buildsuite: function(next) { // find the test suite in the build
          next(null, util.arrayFind(testsuites, function(suite) {
            return suite.package == row.pkg && suite.name == row.cls;
          }).value);
        },
        test: [ 'buildsuite', function(next, results) { // find the test
          if ( ! (results.buildsuite && results.buildsuite.testcases)) { return next(); }
          next(null, util.arrayFind(results.buildsuite.testcases, function(test) {
            return test.name == row.test;
          }).value);
        } ]
      }, function(err, results) { // and add this test to the grade report
        if ( ! results.reportsuite) {
          reporttarget.push(results.reportsuite = {
              package: row.pkg,
              name: row.cls,
              testcases: []
          });
          if (results.buildsuite) {
            results.reportsuite.properties = results.buildsuite.properties;
          } else {
            results.reportsuite.missing = true;
          }
        }
        if ( ! results.test) {
          log.info({ row: row }, 'test missing');
          results.test = {
            name: row.test,
            missing: true
          };
        }
        results.reportsuite.testcases.push(results.test);
        results.test.grade = gradeTest(row, results.test);
        report.score += results.test.grade.score;
        report.outof += results.test.grade.outof;
        next();
      });
    }, function() { // write the grade report to disk
      fs.writeFile(output + '.json', JSON.stringify(report), function(err) {
        if (err) {
          err.dmesg = 'error writing grade report';
        }
        callback(err, report);
      });
    });
  });
};

exports.findTest = function(build, category, suitename, testname, callback) {
  log.info({ spec: build.spec, test: [ category, suitename, testname ] }, 'findTest');
  var json = build.json[category];
  async.detectSeries(json && json.testsuites || [], function(suite, found) {
    found(suite.name == suitename);
  }, function(suite) {
    async.detectSeries(suite && suite.testcases || [], function(test, found) {
      found(test.name == testname);
    }, function(test) {
      callback(test ? null : { dmesg: 'not found' }, test);
    });
  });
};

function milestoneDir(spec, name) {
  return path.join(config.build.results, 'milestones', config.student.semester, spec.kind, spec.proj, name);
}

exports.isMilestoneReleasedSync = function(spec, name) {
  return fs.existsSync(path.join(milestoneDir(spec, name), 'released'));
};

exports.findMilestones = function(spec, callback) {
  log.info({ spec: spec }, 'findMilestones');
  var kind = spec.kind || config.glob.kind;
  var proj = spec.proj || '*';
  glob(path.join('milestones', config.student.semester, kind, proj, '*'), {
    cwd: config.build.results
  }, function(err, files) {
    if (err) {
      err.dmesg = err.dmesg || 'error finding milestones';
      callback(err);
      return;
    }
    async.map(files, function(file, set) {
      var parts = file.split(path.sep);
      var spec = { kind: parts[2], proj: parts[3], name: parts[4] };
      spec.released = exports.isMilestoneReleasedSync(spec, spec.name);
      set(null, spec);
    }, callback);
  });
};

exports.findMilestone = function(spec, name, callback) {
  log.info({ spec: spec, name: name }, 'findMilestone');
  var dir = milestoneDir(spec, name);
  git.findStudentRepos(spec, function(err, repos) {
    var reporevs = [];
    async.forEach(repos, function(spec, next) {
      async.forEach(spec.users, function(user, next) {
        var json = path.join(dir, user + '.json');
        fs.exists(json, function(graded) {
          if (graded) {
            fs.readFile(json, function(err, data) {
              try {
                reporevs.push(JSON.parse(data));
              } catch (err) {
                log.error(err, { spec: spec, name: name, user: user, file: json });
                next(err);
                return;
              }
              next();
            });
          } else {
            reporevs.push({ kind: spec.kind, proj: spec.proj, users: [ user ] });
            next();
          }
        });
      }, function(err) { next(err); });
    }, function(err) {
      async.sortBy(reporevs, function(reporev, use) {
        use(null, (config.staff.users.indexOf(reporev.users[0]) < 0 ? '-' : '') + reporev.users.join('-'));
      }, function(sorterr, reporevs) {
        callback(err || sorterr, {
          kind: spec.kind,
          proj: spec.proj,
          name: name,
          released: exports.isMilestoneReleasedSync(spec, name),
          reporevs: reporevs
        });
      });
    });
  });
};

exports.findMilestoneGrade = function(spec, name, callback) {
  log.info({ spec: spec, name: name }, 'findMilestoneGrade');
  var json = path.join(milestoneDir(spec, name), spec.users.join('-') + '.json');
  fs.readFile(json, function(err, data) {
    if (err) {
      err.dmesg = err.dmesg || 'error reading milestone grade';
      callback(err);
      return;
    }
    try {
      callback(null, JSON.parse(data));
    } catch (err) {
      log.error(err, { spec: spec, name: name, file: json });
      callback(err);
    }
  });
};

exports.createMilestone = function(spec, name, callback) {
  if ( ! name.match(/^\w+$/)) {
    callback({ dmesg: 'Invalid name' });
  } else {
    mkdirp(milestoneDir(spec, name), callback);
  }
};

exports.releaseMilestone = function(spec, name, callback) {
  var dir = milestoneDir(spec, name);
  if ( ! fs.existsSync(dir)) {
    log.error({ spec: spec, name: name }, 'releaseMilestone no such directory');
    callback({ dmesg: 'No milestone directory' });
    return;
  }
  fs.open(path.join(dir, 'released'), 'w', function(err, fd) {
    if (fd) { fs.closeSync(fd); }
    callback(err);
  });
};

exports.gradeFromBuilds = function(spec, milestone, userBuilds, callback) {
  log.info({ spec: spec, milestone: milestone, userBuilds: !!userBuilds }, 'gradeFromBuilds');
  var accepts = [];
  var rejects = [];
  async.each(Object.keys(userBuilds), function(username, next) {
    var build = userBuilds[username];
    accepts.push({ users: [ username ], rev: build.spec.rev });
    build.spec.grade = build.json.grade;
    fs.writeFile(path.join(milestoneDir(spec, milestone), username + '.json'),
                 JSON.stringify(build.spec),
                 function(err) { next(err); });
  }, function(err) {
    callback(err, accepts, rejects);
  });
};

exports.gradeFromSweep = function(spec, milestone, usernames, sweep, callback) {
  log.info({ spec: spec, milestone: milestone, usernames: usernames, sweep: !!sweep }, 'gradeFromSweep');
  var accepts = [];
  var rejects = [];
  async.each(usernames, function(username, next) {
    async.detect(sweep.reporevs, function(reporev, found) {
      found(reporev.users.indexOf(username) >= 0 && reporev.kind == spec.kind && reporev.proj == spec.proj);
    }, function(reporev) {
      if ( ! reporev) {
        rejects.push({ users: [ username ] });
        return next();
      }
      accepts.push({ users: [ username ], rev: reporev.rev });
      fs.writeFile(path.join(milestoneDir(spec, milestone), username + '.json'),
                   JSON.stringify(reporev),
                   function(err) { next(err); });
    });
  }, function(err) {
    callback(err, accepts, rejects);
  });
};

// command-line grade
if (require.main === module) {
  var args = process.argv.slice(2);
  if ( ! args.join(' ').match(/^\{.+\} .+ .+\.json .+\.json .+$/)) {
    log.error('expected arguments: <spec> <grading-dir> <public.json> <hidden.json> <output-basename>');
    return;
  }
  exports.grade(JSON.parse(args[0]), args[1], {
    json: {
      public: JSON.parse(fs.readFileSync(args[2])),
      hidden: JSON.parse(fs.readFileSync(args[3]))
    }
  }, args[4], function(err, report) {
    if (err) {
      log.error(err);
    } else {
      log.info({ score: report.score, outof: report.outof });
    }
  });
}
