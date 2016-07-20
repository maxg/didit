const https = require('https');
const express = require('express');

const config = require('./config');
const log = require('./logger').cat('redirect');

const app = express();

const port = config.web.port == 443 ? '' : ':' + config.web.port;

app.get('*', function(req, res, next) {
  log.info('redirecting', req.path);
  if ( ! req.headers.host) {
    res.status(400).send('Bad request: missing host');
    return;
  }
  res.redirect('https://' + req.hostname + port + req.path);
});

module.exports = app;
