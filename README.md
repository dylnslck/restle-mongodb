# Restle MongoDB Adapter
MongoDB persistence layer adapter used for [Restle](https://github.com/dcslack/restle).

[![npm version](https://badge.fury.io/js/restle-mongodb.svg)](http://badge.fury.io/js/restle-mongodb)
[![Build Status](https://travis-ci.org/dcslack/restle-mongodb.svg)](https://travis-ci.org/dcslack/restle-mongodb)

```sh
$ npm install restle --save
$ npm install restle-mongodb --save
```

```js
const Restle = require('restle');
const Adapter = require('restle-mongodb');

const adapter = new Adapter({
  url: 'mongodb://...',
});

const app = new Restle({
  adapter: adapter,
  namespace: 'api',
  port: 3000,
});

app.on('ready', () => {
  // MongoDB adapter is connected
});
```
