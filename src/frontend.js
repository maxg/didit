const async = require('async');
const bodyparser = require('body-parser');
const cookieparser = require('cookie-parser');
const express = require('express');
const favicon = require('serve-favicon');
const moment = require('moment');
const path = require('path');
const pug = require('pug');
const responsetime = require('response-time');

const config = require('./config');
const cached = require('./cached');
const builder = require('./builder');
const decider = require('./decider');
const gatekeeper = require('./gatekeeper');
const git = require('./git');
const grader = require('./grader');
const outofband = require('./outofband');
const rolodex = require('./rolodex');
const sweeper = require('./sweeper');
const util = require('./util');
const logger = require('./logger');
const log = logger.cat('frontend');

const app = express();

app.set('view engine', 'pug');
app.set('x-powered-by', false);

const static = cached.static(path.join(__dirname, '..', 'public'), { fallthrough: false });

app.use(favicon(path.join(__dirname, '..', 'public', 'favicon.png')));
app.use('/static', static);
app.use(logger.express());
app.use(responsetime());
app.use(cookieparser());
app.use(bodyparser.urlencoded({ extended: false }));

Object.assign(app.locals, {
  config: require('./config'),
  
  // format dates & times
  moment,
  
  // generate static resource URLs
  static: url => '/static' + static.url(url),
  
  // generate Git remote URLs
  remote: config.student.remote && function(spec, user) {
    return config.student.remote.replace('[user]', user) + '/' + config.student.semester
           + '/' + spec.kind + '/' + spec.proj + '/' + spec.users.join('-') + '.git';
  },
  
  // generate gitweb URLs
  gitweb: config.gitweb && function(spec) {
    return config.gitweb.url + '/' + spec.kind + '/' + spec.proj
           + '/' + spec.users.join('-') + '.git/' + (spec.rev || '');
  }
});

// validate parameter against anchored regex
function validate(regex) {
  let anchored = new RegExp('^' + regex.source + '$');
  return function(req, res, next, val) {
    if (anchored.test(val)) { next(); } else { next('route'); }
  };
}

app.param('kind', validate(/[\w-]+/));
app.param('kind', function(req, res, next, kind) {
  next(config.student.kinds && config.student.kinds.indexOf(kind) < 0 ? 'route' : undefined);
});
app.param('proj', validate(/[\w-]+/));
app.param('users', validate(/\w+(-\w+)*/));
app.param('users', function(req, res, next, users) {
  req.params.users = users.split('-');
  next();
});
app.param('rev', validate(/[a-f0-9]{7}/));
app.param('name', validate(/\w+/));
app.param('datetime', validate(/\d{8}T\d{6}/));
app.param('datetime', function(req, res, next, datetime) {
  req.params.datetime = moment(datetime, moment.compactFormat);
  next();
});
app.param('category', validate(/public|hidden/));
app.param('filename', function(req, res, next, filename) {
  let parts = filename.split('.');
  req.params.filename = { name: parts[0], exts: parts.slice(1) };
  next();
});

// authenticate the user by certificate
function authenticate(req, res, next) {
  let cert = req.connection.getPeerCertificate();
  if ( ! req.connection.authorized) {
    res.status(401);
    res.render('401', {
      error: req.connection.authorizationError,
      cert
    });
  } else {
    res.locals.authuser = cert.subject.emailAddress.replace('@' + config.web.certDomain, '');
    res.locals.authstaff = config.staff.users.indexOf(res.locals.authuser) >= 0;
    res.locals.staffmode = res.locals.authstaff && req.cookies.staffmode == 'true';
    res.set('X-Authenticated-User', res.locals.authuser);
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

app.get('*', function(req, res, next) {
  res.set('Content-Security-Policy', "default-src 'self' https://*.googleapis.com https://*.gstatic.com https://maxcdn.bootstrapcdn.com")
  res.locals.stats = decider.stats();
  next();
});

// unauthenticated status page
app.get('/status', function(req, res, next) {
  res.json({ stats: res.locals.stats });
});

// all other GET requests must be authenticated
app.get('*', authenticate);

app.get('/', function(req, res, next) {
  let difference = async.apply(util.difference, util.equalityModulo('kind', 'proj'));
  let findAll = {
    repos: async.apply(git.findStudentRepos, { users: [ res.locals.authuser ] }),
    released: [ 'repos', function(results, next) {
      gatekeeper.findReleasedProjects({}, function(err, projects) {
        next(err, projects && difference(projects, results.repos));
      });
    } ]
  };
  if (res.locals.authstaff) {
    findAll.built = builder.findProjects;
    findAll.releasable = [ 'built', function(results, next) {
      git.findReleasableProjects(function(err, projects) {
        next(err, projects && difference(projects, results.built));
      });
    } ];
  }
  async.auto(findAll, function(err, results) {
    if (err) { return next(err); }
    res.render('index', results);
  });
});

app.get('/milestone/:kind/:proj/:users/:name', authorize, function(req, res, next) {
  let released = grader.isMilestoneReleasedSync(req.params, req.params.name);
  if ( ! (res.locals.authstaff || released)) {
    return res.status(404).render('404');
  }
  async.auto({
    graded: async.apply(grader.findMilestoneGrade, req.params, req.params.name),
    build: [ 'graded', function(results, callback) {
      builder.findBuild(results.graded, callback);
    } ]
  }, function(err, results) {
    res.status(err ? 404 : 200);
    res.render(err ? 'missing' : 'grade', {
      kind: req.params.kind,
      proj: req.params.proj,
      users: req.params.users,
      rev: results.build && results.build.spec.rev,
      name: req.params.name,
      released,
      grade: results.graded && results.graded.grade,
      build: results.build
    });
  });
});

app.get('/milestone/:kind/:proj/:name:extension(.csv)?', staffonly, function(req, res, next) {
  async.auto({
    milestone: async.apply(grader.findMilestone, req.params, req.params.name),
    sweeps: async.apply(sweeper.findSweeps, req.params)
  }, function(err, results) {
    if (err) { return next(err); }
    if (req.params.extension == '.csv') {
      res.set({ 'Content-Type': 'text/csv' });
      res.render('csv/grades', {
        title: 'Milestone ' + req.params.name,
        reporevs: results.milestone.reporevs
      });
      return;
    }
    res.render('milestone', {
      kind: req.params.kind,
      proj: req.params.proj,
      name: req.params.name,
      milestone: results.milestone,
      sweeps: results.sweeps
    });
  });
});

app.get('/sweep/:kind/:proj/:datetime:extension(.csv)?', staffonly, function(req, res, next) {
  sweeper.findSweep(req.params, function(err, sweep) {
    if (req.params.extension == '.csv') {
      res.set({ 'Content-Type': 'text/csv' });
      res.render('csv/grades', {
        title: 'Sweep ' + req.params.datetime.format('llll'),
        reporevs: sweep.reporevs
      });
      return;
    }
    res.status(err ? 404 : 200);
    res.render(err ? '404' : 'sweep', {
      kind: req.params.kind,
      proj: req.params.proj,
      datetime: req.params.datetime,
      sweep
    });
  });
});

app.get('/u/:users', authorize, function(req, res, next) {
  async.auto({
    repos: async.apply(git.findStudentRepos, req.params),
    fullnames(callback) {
      async.map(req.params.users, rolodex.lookup, function(err, fullnames) {
        callback(null, fullnames);
      });
    }
  }, function(err, results) {
    if (err) { return next(err); }
    res.render('users', {
      users: req.params.users,
      repos: results.repos,
      fullnames: results.fullnames
    });
  });
});

app.get('/:kind/:proj', authorize, function(req, res, next) {
  let mine = { kind: req.params.kind, proj: req.params.proj, users: [ res.locals.authuser ] };
  let findAll = {
    myrepos: async.apply(git.findStudentRepos, mine),
    repos: async.apply(git.findStudentRepos, res.locals.authstaff ? req.params : mine),
    fullnames: [ 'repos', function(results, callback) {
      async.each(results.repos, function(repo, callback) {
        async.map(repo.users, rolodex.lookup, function(err, fullnames) {
          repo.fullnames = fullnames;
          callback();
        });
      }, function(err) { callback(); });
    } ],
    released: async.apply(gatekeeper.isProjectReleased, req.params),
    startable: async.apply(gatekeeper.findTickets, mine)
  };
  if (res.locals.authstaff) {
    findAll.starting = async.apply(git.hasStartingRepo, req.params);
    findAll.tickets = async.apply(gatekeeper.findTickets, req.params);
    findAll.sweeps = async.apply(sweeper.findSweeps, req.params);
    findAll.schedSweeps = async.apply(sweeper.scheduledSweeps, req.params);
    findAll.milestones = async.apply(grader.findMilestones, req.params);
  }
  async.auto(findAll, function(err, results) {
    results.kind = req.params.kind;
    results.proj = req.params.proj;
    res.render('proj', results);
  });
});

app.get('/:kind/:proj/:users.git', authorize, function(req, res, next) {
  res.redirect(301, req.path.replace(/\.git$/, ''));
});

app.get('/:kind/:proj/:users', authorize, function(req, res, next) {
  async.auto({
    builds: async.apply(builder.findBuilds, req.params),
    milestones: async.apply(grader.findMilestones, req.params),
    head: [ 'builds', 'milestones', function(results, callback) {
      git.studentSourceRev(req.params, callback);
    } ]
  }, function(err, results) {
    let locals = {
      kind: req.params.kind,
      proj: req.params.proj,
      users: req.params.users,
      builds: results.builds,
      head: results.head,
      current: null,
      milestones: results.milestones
    };
    if (results.head || (results.builds.length > 0)) {
      let spec = results.head ? {
        kind: locals.kind, proj: locals.proj, users: locals.users, rev: results.head
      } : results.builds[0];
      builder.findBuild(spec, function(err, build) {
        locals.current = build;
        res.render('repo', locals);
      });
    } else {
      res.render('repo', locals);
    }
  });
});

app.get('/:kind/:proj/:users.git/:sha([a-f0-9]+)', authorize, function(req, res, next) {
  res.redirect(301, req.path.replace(/\.git\/.*$/, '/'+req.params.sha.substr(0,7)));
});

app.get('/:kind/:proj/:users/:rev', authorize, function(req, res, next) {
  builder.findBuild(req.params, function(err, build) {
    res.status(err ? 404 : 200);
    res.render(err ? 'missing' : 'build', {
      kind: req.params.kind,
      proj: req.params.proj,
      users: req.params.users,
      rev: req.params.rev,
      build
    });
  });
});

app.get('/:kind/:proj/:users/:rev/payload/:category/:suite/:filename', authorize, function(req, res, next) {
  if (req.params.category != 'public' && ! res.locals.authstaff) {
    return res.status(404).render('404');
  }
  builder.findBuild(req.params, function(err, build) {
    if (err) { return res.status(404).render('404'); }
    let testname = req.params.filename.name;
    grader.findTest(build, req.params.category, req.params.suite, testname, function(err, test) {
      if (err || ! test.payload) { return res.status(404).render('404'); }
      
      res.set('Content-Security-Policy',
              "default-src 'none'; style-src 'unsafe-inline'; img-src data:;");
      req.params.filename.exts.forEach(function(ext) {
        if (ext == 'gz') { return res.set('Content-Encoding', 'gzip'); }
        res.type(ext);
      });
      res.send(new Buffer(test.payload.data || '', 'base64'));
    });
  });
});

app.get('/:kind/:proj/:users/:rev/grade', staffonly, function(req, res, next) {
  builder.findBuild(req.params, function(err, build) {
    res.status(err ? 404 : 200);
    res.render(err ? 'missing' : 'grade', {
      kind: req.params.kind,
      proj: req.params.proj,
      users: req.params.users,
      rev: req.params.rev,
      grade: build && build.json.grade,
      build
    });
  });
});

app.get('*', function(req, res) {
  res.status(404).render('404');
});

// build requests are not authenticated (the requester would have to guess a SHA)
app.post('/build/:kind/:proj/:users/:rev', function(req, res, next) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  let url = 'https://'+req.hostname+'/'+req.params.kind+'/'+req.params.proj+'/'+req.params.users.join('-');
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
      
      let monitor = builder.monitor(buildId);
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
        } else if (output.err) {
          res.write('Error running build: ' + (output.err.dmesg || 'unknown error') + '\n');
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
        let listeners = (req.body.listeners || '').split(',').filter(function(user) {
          return user.length > 0;
        }).map(function(user) {
          return user.trim();
        });
        outofband.notifyBuild(req.params, buildId, listeners, {
          url,
          oldrev: req.body.oldrev ? (/[a-f0-9]+/.exec(req.body.oldrev)[0]) : null
        });
      }
    });
  });
});

// all other POST requests must be authenticated
app.post('*', authenticate);

app.post('/start/:kind/:proj/:users', authorize, function(req, res, next) {
  async.auto({
    released(next) {
      if (res.locals.authstaff) { return next(null, true); }
      gatekeeper.isProjectReleased(req.params, next);
    },
    ticket(next) {
      gatekeeper.findTickets(req.params, function(err, tickets) {
        if (tickets.length == 0 && res.locals.authstaff) {
          tickets = [ req.params ];
        }
        if (tickets.length > 1) {
          return next('Multiple matching repository permissions');
        }
        next(null, tickets[0]);
      });
    }
  }, function(err, results) {
    if (err) { return next(err); }
    if ( ! (results.released && results.ticket)) {
      return res.render('404', { error: 'No permission to create repository' })
    }
    git.createStudentRepo(results.ticket, res.locals.authuser, function(err) {
      if (err) { return next(err); }
      res.redirect('/' + results.ticket.kind + '/' + results.ticket.proj + '/' + results.ticket.users.join('-'));
    });
  });
});

app.post('/grade/:kind/:proj/:name/revs', staffonly, function(req, res, next) {
  let userBuilds = {};
  let rejects = [];
  async.each(Object.keys(req.body).filter(key => key.startsWith('revision.')), function(users, callback) {
    if ( ! req.body[users]) { return callback(); }
    let revtext = req.body[users].toString();
    let rev = (/^[a-f0-9]{7}/.exec(revtext) || [])[0];
    users = users.split('.')[1].split('-');
    if ( ! rev) {
      log.warn({ params: req.params, users, rev: revtext }, 'invalid rev for grade');
      rejects.push({ users, rev: revtext });
      return callback();
    }
    builder.findRepos({
      kind: req.params.kind, proj: req.params.proj, users
    }, function(err, repos) {
      if (err || repos.length != 1) {
        log.warn({ params: req.params, users, rev }, 'no repo for grade');
        rejects.push({ users, rev });
        return callback();
      }
      builder.findBuild({
        kind: repos[0].kind, proj: repos[0].proj, users: repos[0].users, rev
      }, function(err, build) {
        if (err) {
          log.warn({ params: req.params, users, rev }, 'no build for grade');
          rejects.push({ users, rev });
        } else {
          users.forEach(function(user) { userBuilds[user] = build; });
        }
        callback();
      });
    });
  }, function(err) {
    grader.gradeFromBuilds(req.params, req.params.name, userBuilds, function(err, accepted, rejected) {
      if (err) {
        err.dmesg = err.dmesg || 'Error assigning grades';
        return next(err);
      }
      outofband.notifyGradeFromBuilds(req.params, accepted, res.locals.authuser);
      res.render('graded', {
        kind: req.params.kind,
        proj: req.params.proj,
        name: req.params.name,
        accepts: accepted,
        rejects: rejects.concat(rejected)
      });
    });
  });
});

app.post('/grade/:kind/:proj/:name/sweep', staffonly, function(req, res, next) {
  req.params.datetime = moment(req.body.datetime, moment.compactFormat);
  let usernames = req.body.usernames.split('\n').map(function(user) {
    return user.trim();
  }).filter(function(user) {
    return user.length > 0;
  });
  sweeper.findSweep(req.params, function(err, sweep) {
    if (err) {
      err.dmesg = err.dmesg || 'Error finding sweep';
      return next(err);
    }
    grader.gradeFromSweep(req.params, req.params.name, usernames, sweep, function(err, accepted, rejected) {
      if (err) {
        err.dmesg = err.dmesg || 'Error assigning grades';
        return next(err);
      }
      outofband.notifyGradeFromSweep(req.params, accepted, res.locals.authuser);
      res.render('graded', {
        kind: req.params.kind,
        proj: req.params.proj,
        name: req.params.name,
        accepts: accepted,
        rejects: rejected
      });
    });
  });
});

app.post('/milestone/:kind/:proj', staffonly, function(req, res, next) {
  grader.createMilestone(req.params, req.body.name.toLowerCase().trim(), function(err) {
    if (err) {
      err.dmesg = err.dmesg || 'Error creating milestone';
      return next(err);
    }
    res.redirect('/' + req.params.kind + '/' + req.params.proj);
  });
});

app.post('/milestone/:kind/:proj/:name/release', staffonly, function(req, res, next) {
  grader.releaseMilestone(req.params, req.params.name, function(err) {
    if (err) {
      err.dmesg = err.dmesg || 'Error releasing milestone grades';
      return next(err);
    }
    outofband.notifyMilestoneRelease(req.params, res.locals.authuser);
    res.redirect('/milestone/' + req.params.kind + '/' + req.params.proj + '/' + req.params.name);
  })
});

app.post('/sweep/:kind/:proj/:datetime/rebuild', staffonly, function(req, res, next) {
  let params = req.params;
  let datetime = req.params.datetime;
  let requester = res.locals.authuser;
  sweeper.rebuildSweep(params, function(err) {
    if (err) {
      err.dmesg = err.dmesg || 'Error rebuilding sweep';
      return next(err);
    }
    outofband.notifySweepRebuildStart(params, datetime, requester);
    res.redirect('/sweep/' + params.kind + '/' + params.proj
                 + '/' + datetime.format(moment.compactFormat));
  }, function(err) {
    outofband.notifySweepRebuildComplete(params, datetime, requester);
    log.info({ spec: params, when: datetime }, 'finished rebuild');
  });
});

app.post('/sweep/:kind/:proj', staffonly, function(req, res, next) {
  let params = req.params;
  let datetime = moment(req.body.date + ' ' + req.body.time, moment.gitFormat);
  let requester = res.locals.authuser;
  if ( ! datetime.isValid()) {
    return next({ dmesg: 'Invalid date and time' });
  }
  sweeper.scheduleSweep(params, datetime, function(err) {
    if (err) {
      err.dmesg = err.dmesg || 'Error starting sweep';
      return next(err);
    }
    res.redirect('/' + params.kind + '/' + params.proj);
  }, function(err) {
    outofband.notifySweepStart(params, datetime, requester);
    log.info({ spec: params, when: datetime }, 'started sweep');
  }, function(err) {
    outofband.notifySweepComplete(params, datetime, requester);
    log.info({ spec: params, when: datetime }, 'finished sweep');
  });
});

app.post('/catchup/:kind/:proj', staffonly, function(req, res, next) {
  let hours = parseInt(req.body.hours);
  if ( ! hours) {
    return next({ dmesg: 'Invalid interval' });
  }
  sweeper.scheduleCatchups(req.params, hours, function(err) {
    if (err) {
      err.dmesg = err.dmesg || 'Error starting catch-up';
      return next(err);
    }
    res.redirect('/' + req.params.kind + '/' + req.params.proj);
  });
});

app.post('/starting/:kind/:proj', staffonly, function(req, res, next) {
  git.createStartingRepo(req.params, res.locals.authuser, function(err) {
    if (err) {
      err.dmesg = err.dmesg || 'Error creating starting repository';
      return next(err);
    }
    outofband.notifyProjectStarting(req.params, res.locals.authuser);
    res.redirect('/' + req.params.kind + '/' + req.params.proj);
  });
});

app.post('/tickets/:kind/:proj', staffonly, function(req, res, next) {
  let usernames = req.body.usernames.split('\n').map(function(users) {
    return users.trim();
  }).filter(function(users) {
    return users.match(/^\w+(-\w+)*$/);
  }).map(function(users) {
    return users.split('-');
  });
  gatekeeper.createTickets(req.params, usernames, function(err) {
    if (err) {
      err.dmesg = err.dmesg || 'Error adding student permissions';
      return next(err);
    }
    res.redirect('/' + req.params.kind + '/' + req.params.proj);
  });
});

app.post('/release/:kind/:proj', staffonly, function(req, res, next) {
  gatekeeper.releaseProject(req.params, function(err) {
    if (err) {
      err.dmesg = err.dmesg || 'Error releasing assignment';
      return next(err);
    }
    outofband.notifyProjectReleased(req.params, res.locals.authuser);
    res.redirect('/' + req.params.kind + '/' + req.params.proj);
  });
});

app.post('/:kind/:proj/:users/:rev/rebuild', staffonly, function(req, res, next) {
  builder.startBuild(req.params, function(err, buildId) {
    if (err) {
      err.dmesg = err.dmesg || 'Error starting rebuild';
      return next(err);
    }
    res.redirect('/' + req.params.kind + '/' + req.params.proj
                 + '/' + req.params.users.join('-') + '/' + req.params.rev);
  });
});

app.use(function(err, req, res, next) {
  log.error({ err, req }, 'application error');
  res.status(500);
  res.render('500', {
    error: err.dmesg || '',
    stack: app.get('env') == 'development' ? err.stack : ''
  });
});

module.exports = app;
