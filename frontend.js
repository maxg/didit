var async = require('async');
var express = require('express');
var jade = require('jade');
var moment = require('moment');
var path = require('path');

var config = require('./config');
var builder = require('./builder');
var decider = require('./decider');
var outofband = require('./outofband');
var sweeper = require('./sweeper');
var logger = require('./logger');
var log = logger.cat('frontend');

var app = express();

app.set('view engine', 'jade');

app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(logger.express());
app.use(express.cookieParser());
app.use(express.bodyParser());

app.locals({
  config: require('./config'),
  moment: moment
});

// use string callbacks to check input against anchored regex
app.param(function(name, fn) {
  if (fn.constructor == String) {
    return function(req, res, next, val) {
      if (val.match('^' + fn + '$')) { next(); } else { next('route'); }
    }
  }
});
app.param('kind', '\\w+');
app.param('proj', '\\w+');
app.param('users', '[\\w-]+');
app.param('users', function(req, res, next, users) {
  req.params.users = users.split('-');
  next();
});
app.param('rev', '[a-f0-9]+');
app.param('datetime', '\\d{8}T\\d{6}')
app.param('datetime', function(req, res, next, datetime) {
  req.params.datetime = moment(datetime, moment.compactFormat);
  next();
});

// authenticate the user by certificate
function authenticate(req, res, next) {
  var cert = req.connection.getPeerCertificate();
  if ( ! req.connection.authorized) {
    res.status(401);
    res.render('401', {
      error: req.connection.authorizationError,
      cert: cert
    });
  } else {
    res.locals.authuser = cert.subject.emailAddress.replace('@MIT.EDU', '');
    res.locals.authstaff = config.staff.users.indexOf(res.locals.authuser) >= 0;
    res.locals.staffmode = res.locals.authstaff && req.cookies.staffmode == 'true';
    next();
  }
}

// check that the authenticated user is allowed to make the request
function authorize(req, res, next) {
  log.info('authorize', req.params, res.locals.authuser);
  if (req.params.users && req.params.users.indexOf(res.locals.authuser) < 0 && ! res.locals.authstaff) {
    // not one of the requested users, or staff
    res.render('401', { error: 'You are not ' + req.params.users.join(' or ') });
  } else {
    next();
  }
}

// check that the authenticated user is staff
function staffonly(req, res, next) {
  log.info('staffonly', req.params, res.locals.authuser);
  if ( ! res.locals.authstaff) {
    res.render('401', { error: 'You are not staff' });
  } else {
    next();
  }
}

// all GET requests must be authenticated
app.get('*', authenticate);

app.get('*', function(req, res, next) {
  res.locals.stats = decider.stats();
  next();
});

app.get('/', function(req, res) {
  builder.findRepos({ users: [ res.locals.authuser ] }, function(err, repos) {
    res.render('index', {
      repos: repos,
      projects: res.locals.authstaff ? builder.findProjectsSync() : []
    });
  });
});

app.get('/sweep/:kind/:proj/:datetime', staffonly, function(req, res) {
  sweeper.findSweep(req.params, function(err, sweep) {
    res.status(err ? 404 : 200);
    res.render(err ? '404' : 'sweep', {
      kind: req.params.kind,
      proj: req.params.proj,
      datetime: req.params.datetime,
      sweep: sweep
    });
  });
});

app.get('/u/:users', authorize, function(req, res) {
  builder.findRepos(req.params, function(err, repos) {
    res.render('users', {
      users: req.params.users,
      repos: repos
    });
  });
});

app.get('/:kind/:proj', authorize, function(req, res) {
  var findAll = {};
  if ( ! res.locals.authstaff) {
    req.params.users = [ res.locals.authuser ];
  } else {
    findAll.sweeps = async.apply(sweeper.findSweeps, req.params);
  }
  findAll.repos = async.apply(builder.findRepos, req.params);
  async.auto(findAll, function(err, results) {
    res.render('proj', {
      kind: req.params.kind,
      proj: req.params.proj,
      repos: results.repos,
      sweeps: results.sweeps
    });
  });
});

app.get('/:kind/:proj/:users', authorize, function(req, res) {
  builder.findBuilds(req.params, function(err, builds) {
    var locals = {
      kind: req.params.kind,
      proj: req.params.proj,
      users: req.params.users,
      builds: builds,
      current: null
    };
    if (builds.length > 0) {
      builder.findBuild(builds[0], function(err, build) {
        locals.current = build;
        res.render('repo', locals);
      });
    } else {
      res.render('repo', locals);
    }
  });
});

app.get('/:kind/:proj/:users/:rev', authorize, function(req, res) {
  builder.findBuild(req.params, function(err, build) {
    res.status(err ? 404 : 200);
    res.render(err ? 'missing' : 'build', {
      kind: req.params.kind,
      proj: req.params.proj,
      users: req.params.users,
      rev: req.params.rev,
      build: build
    });
  });
});

app.get('*', function(req, res) {
  res.status(404);
  res.render('404');
});

// build requests are not authenticated (the requester would have to guess a SHA)
app.post('/build/:kind/:proj/:users/:rev', function(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  var url = 'https://'+req.host+'/'+req.params.kind+'/'+req.params.proj+'/'+req.params.users.join('-');
  builder.findBuild(req.params, function(err, build) {
    if (build) {
      res.end('Revision already built: < ' + url + ' >\n');
      return;
    }
    builder.startBuild(req.params, function(err, buildId) {
      if (err) {
        res.end('Error starting build: ' + (err.dmesg || 'unknown error') + '\n');
        return;
      }
      log.info('started build', buildId);
      
      var monitor = builder.monitor(buildId);
      monitor.on('start', function(input) {
        res.write('Started build\n');
      });
      monitor.on('progress', function(output) {
        res.write((output.message || '...') + '\n');
      });
      monitor.on('done', function(output) {
        if (output.result) {
          res.write('Compilation ' + (output.result.compile ? 'succeeded' : 'FAILED') + '\n');
          res.write('Public tests ' + (output.result.public ? 'passed' : 'FAILED') + '\n');
        } else if (err) {
          res.write('Error running build: ' + (err.dmesg || 'unknown error') + '\n');
        }
        res.end('Details: < ' + url + ' >\n');
      });
      setTimeout(function() {
        monitor.cancel();
        if (res.writable) {
          res.end('Build in progress...\nResults: < ' + url + ' >\n');
        }
      }, 30000);
      
      if (req.body.listeners || req.params.users.length > 1) {
        var listeners = (req.body.listeners || '').split(',').filter(function(user) {
          return user.length > 0;
        }).map(function(user) {
          return user.trim();
        });
        outofband.notify(req.params, buildId, listeners, {
          url: url,
          oldrev: req.body.oldrev ? (/[a-f0-9]+/.exec(req.body.oldrev)[0]) : null
        });
      }
    });
  });
});

// all other POST requests must be authenticated
app.post('*', authenticate);

app.post('/sweep/:kind/:proj', staffonly, function(req, res) {
  sweeper.startSweep(req.params, function(err) {
    if (err) {
      res.status(500);
      res.render('500', { error: err.dmesg || 'Error starting sweep' });
    } else {
      res.redirect('/' + req.params.kind + '/' + req.params.proj);
    }
  });
});

app.use(function(err, req, res, next) {
  log.error(err, 'application error');
  res.status(500);
  res.render('500', {
    stack: app.get('env') == 'development' ? err.stack : ''
  });
});

module.exports = app;
