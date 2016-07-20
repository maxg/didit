const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const http = require('http');
const request = require('request');
const should = require('should');
const sinon = require('sinon');

const fixtures = require('./fixtures');

describe('cached', function() {
  
  let cached = require('../src/cached');
  
  let fix = fixtures();
  let sandbox = sinon.sandbox.create();
  
  beforeEach(function(done) {
    fix.files(this.currentTest, done);
  });
  
  afterEach(function() {
    fix.forget();
    sandbox.restore();
  });
  
  describe('middleware', function() {
    
    let app;
    let server;
    
    beforeEach(function(done) {
      app = express();
      app.use(cached.static(fix.fixdir));
      server = http.createServer(app);
      server.listen(0, done);
    });
    
    afterEach(done => server.close(done));
    
    function url() { return 'http://localhost:' + server.address().port; }
    
    it('should allow caching for static files', function(done) {
      request(url() + '/0000000000000000/hello.txt', function(req, res, body) {
        res.statusCode.should.equal(200);
        res.headers['cache-control'].should.equal('public, max-age=2592000');
        body.should.equal('Hello, world!\n');
        done();
      });
    });
    it('should not allow caching for missing files', function(done) {
      request(url() + '/0000000000000000/hello.txt', function(req, res, body) {
        res.statusCode.should.equal(404);
        should.not.exist(res.headers['cache-control']);
        body.should.match(/Cannot GET/);
        done();
      });
    });
    it('should not allow caching for redirects', function(done) {
      request({
        url: url() + '/0000000000000000/dir',
        followRedirect: false
      }, function(req, res, body) {
        res.statusCode.should.equal(301);
        should.not.exist(res.headers['cache-control']);
        done();
      });
    });
    it('should not allow caching for missing slug', function(done) {
      request(url() + '/hello.txt', function(req, res, body) {
        res.statusCode.should.equal(200);
        res.headers['cache-control'].should.equal('public, max-age=0');
        body.should.equal('Hello, world!\n');
        done();
      });
    });
    it('should not allow caching for unhandled success', function(done) {
      app.get('/goodbye.txt', function(req, res) {
        res.end('Goodbye, world!');
      });
      request(url() + '/goodbye.txt', function(req, res, body) {
        res.statusCode.should.equal(200);
        should.not.exist(res.headers['cache-control']);
        body.should.equal('Goodbye, world!');
        done();
      });
    });
    it('should not allow caching for unhandled failure', function(done) {
      request(url() + '/0000000000000000/../evil.txt', function(req, res, body) {
        res.statusCode.should.equal(404);
        should.not.exist(res.headers['cache-control']);
        done();
      });
    });
    
    describe('final', function() {
      
      beforeEach(function() {
        app.use('/final', cached.static(fix.fixdir, { fallthrough: false }));
      });
      
      it('should not allow caching on error', function(done) {
        request(url() + '/final/0000000000000000/../evil.txt', function(req, res, body) {
          res.statusCode.should.equal(403);
          should.not.exist(res.headers['cache-control']);
          body.should.match(/Forbidden/);
          done();
        });
      });
    });
  });
  
  describe('url', function() {
    it('should return URL with slug', function() {
      let md5 = crypto.createHash('md5');
      md5.update('Hello, world!\n');
      let slug = md5.digest('hex').slice(-16);
      cached.static(fix.fixdir).url('/hello.txt').should.equal('/' + slug + '/hello.txt');
    });
    it('should cache slugs', function() {
      sandbox.spy(fs, 'readFileSync');
      sandbox.spy(crypto, 'createHash');
      let static = cached.static(fix.fixdir);
      
      let url = static.url('/goodbye.txt');
      fs.readFileSync.calledOnce.should.be.true();
      crypto.createHash.calledOnce.should.be.true();
      
      static.url('/goodbye.txt').should.equal(url);
      fs.readFileSync.calledOnce.should.be.true();
      crypto.createHash.calledOnce.should.be.true();
    });
  });
});
