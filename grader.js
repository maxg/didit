var async = require('async');
var csv = require('csv');
var fs = require('fs');
var glob = require('glob');
var mkdirp = require('mkdirp');
var path = require('path');

var config = require('./config');
var git = require('./git');
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
  var outof = +row.pts;
  var score = ( ! test) || test.missing || test.failure || test.error ? 0 : outof;
  return { score: score, outof: outof };
}

// read grade sheet and grade the results of hidden tests
// callback returns grade report
exports.grade = function(spec, builddir, build, output, callback) {
  log.info({ spec: spec }, 'grade');
  
  var report = {
    spec: spec,
    score: 0,
    outof: 0,
    testsuites: []
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
      async.auto({
        reportsuite: function(next) { // find the test suite in the report
          async.detectSeries(report.testsuites, function(suite, found) {
            found(suite.package == row.pkg && suite.name == row.cls);
          }, function(suite) { next(null, suite); });
        },
        buildsuite: function(next) { // find the test suite in the build
          async.detectSeries(testsuites, function(suite, found) {
            found(suite.package == row.pkg && suite.name == row.cls);
          }, function(suite) { next(null, suite); });
        },
        test: [ 'buildsuite', function(next, results) { // find the test
          async.detect(results.buildsuite && results.buildsuite.testcases || [], function(test, found) {
            found(test.name == row.test);
          }, function(test) { next(null, test); });
        } ]
      }, function(err, results) { // and add this test to the grade report
        if ( ! results.reportsuite) {
          report.testsuites.push(results.reportsuite = {
              package: row.pkg,
              name: row.cls,
              testcases: []
          });
          if ( ! results.buildsuite) {
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

exports.findMilestones = function(spec, callback) {
  log.info({ spec: spec }, 'findMilestones');
  var kind = spec.kind || '*';
  var proj = spec.proj || '*';
  glob(path.join('milestones', config.student.semester, kind, proj, '*'), {
    cwd: config.build.results
  }, function(err, files) {
    callback(err, files.map(function(file) {
      var parts = file.split(path.sep);
      return { kind: parts[2], proj: parts[3], name: parts[4] };
    }));
  });
};

exports.findMilestone = function(spec, name, callback) {
  log.info({ spec: spec, name: name });
  var dir = milestoneDir(spec, name);
  git.findStudentRepos(spec, function(err, repos) {
    var reporevs = [];
    async.forEach(repos, function(spec, next) {
      async.forEach(spec.users, function(user, next) {
        var json = path.join(dir, user + '.json');
        fs.exists(json, function(graded) {
          if (graded) {
            fs.readFile(json, function(err, data) {
              reporevs.push(JSON.parse(data));
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
        use(null, config.staff.users.indexOf(reporev.users[0]) + reporev.users[0]);
      }, function(err, reporevs) {
        callback(err, {
          kind: spec.kind,
          proj: spec.proj,
          name: name,
          reporevs: reporevs
        });
      });
    });
  });
};

exports.createMilestone = function(spec, name, callback) {
  if ( ! name.match(/^\w+$/)) {
    callback({ dmesg: 'Invalid name' });
  } else {
    mkdirp(milestoneDir(spec, name), callback);
  }
};

exports.gradeFromSweep = function(spec, milestone, usernames, sweep, callback) {
  log.info({ spec: spec, milestone: milestone, usernames: usernames, sweep: !!sweep }, 'gradeFromSweep');
  async.forEach(usernames, function(username, next) {
    async.detect(sweep.reporevs, function(reporev, found) {
      found(reporev.users.indexOf(username) >= 0 && reporev.kind == spec.kind && reporev.proj == spec.proj);
    }, function(reporev) {
      fs.writeFile(path.join(milestoneDir(spec, milestone), username + '.json'),
                   JSON.stringify(reporev),
                   function(err) { next(err); });
    });
  }, function(err) {
    callback(err);
  });
};
