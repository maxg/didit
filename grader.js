var async = require('async');
var csv = require('csv');
var fs = require('fs');
var path = require('path');

var config = require('./config');
var log = require('./logger').cat('grader');

// parse a CSV grade sheet
function parseGradeSheet(filename, callback) {
  var sheet = csv().from.path(filename);
  sheet.transform(function(row) {
    if (row[0] == 'junit') { // "junit" rows define graded tests
      return { pkg: row[1], cls: row[2], test: row[3], pts: row[4] };
    } else {                 // skip other rows
      return null;
    }
  });
  sheet.to.array(function(rows) { callback(null, rows); });
}

// assign points given by "row" based on results of "test"
function gradeTest(row, test) {
  var outof = +row.pts;
  var grade = ( ! test) || test.failure || test.error ? 0 : outof;
  return { test: test, grade: grade, outof: outof };
}

// read grade sheet and grade the results of hidden tests
// callback returns grade report
exports.grade = function(spec, builddir, build, output, callback) {
  log.info({ spec: spec }, 'grade');
  
  var report = {
    spec: spec,
    grade: 0,
    outof: 0,
    tests: []
  };
  
  var sheet = path.join(builddir, 'grade.csv');
  if ( ! fs.existsSync(sheet)) {
    log.info('not reading missing grade sheet')
    callback(null, report);
    return;
  }
  parseGradeSheet(sheet, function(err, rows) {
    if (err) {
      log.error(err, 'parseGradeSheet error');
      callback(null, report);
      return;
    }
    async.forEach(rows, function(row, next) {
      async.waterfall([
        function(next) {        // find the test suite
          async.detect(build.json.hidden.testsuites || [], function(suite, found) {
            found(suite.package == row.pkg && suite.name == row.cls);
          }, function(suite) { next(null, suite || {}); });
        },
        function(suite, next) { // find the test
          async.detect(suite.testcases || [], function(test, found) {
            found(test.name == row.test);
          }, function(test) { next(null, test); });
        }
      ], function(err, test) {  // and add this test to the grade report
        if ( ! test) { log.info({ row: row }, 'test missing'); }
        var result = gradeTest(row, test);
        report.grade += result.grade;
        report.outof += result.outof;
        report.tests.push(result);
        next();
      });
    }, function() {             // write the grade report to disk
      fs.writeFile(output + '.json', JSON.stringify(report), function(err) {
        if (err) {
          err.dmesg = 'error writing grade report';
        }
        callback(err, report);
      });
    });
  });
};
