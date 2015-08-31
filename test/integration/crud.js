import Adapter from '../../../dist/lib';
import flushCollections from '../helpers/flush-collections';
import mongodb from 'mongodb';
import test from 'tape';
import init from 'tape';
import before from 'tape';
import after from 'tape';

const url = 'mongodb://restle:restle@ds035613.mongolab.com:35613/restle-dev';

const adapter = new Adapter({ url });

// mockups
const userModel = {
  type: 'user',
  getRelationship(type) {
    const relationships = {
      posts: {
        type: 'post',
        isMany: true,
        related: {
          author: {
            type: 'user',
            isMany: false,
          },
        },
      },
    };

    return relationships[type];
  },
  hasRelationship(type) {
    return !!this.getRelationship(type);
  },
};

const postModel = {
  type: 'post',
  getRelationship(type) {
    const relationships = {
      author: {
        type: 'user',
        isMany: false,
        related: {
          comments: {
            type: 'comment',
            isMany: true,
          },
        }
      },
    };

    return relationships[type];
  },
  hasRelationship(type) {
    return !!this.getRelationship(type);
  },
};

init('flush collections', assert => {
  const MongoClient = mongodb.MongoClient;
  const database = url;

  MongoClient.connect(database, (err, db) => {
    assert.error(err, 'connected to database');

    flushCollections(assert, db, () => {
      assert.end();
      db.close();
    });
  });
});

before('Connect adapter to database', assert => {
  adapter.connect().then(() => {
    assert.ok(adapter.db, 'internal db object found');
    assert.end();
  }, err => {
    assert.error(err, 'no error connecting database');
    assert.fail('error connecting to database');
    assert.end();
  });
});

test(`find(userModel) should be empty`, assert => {
  adapter.find(userModel).then(docs => {
    assert.equal(docs.length, 0, 'no users in database');
    assert.end();
  });
});

test(`createResource(userModel)`, assert => {
  const user = {
    'name': 'Billy Smith',
    'email': 'bs@gmail.com',
  };

  adapter.createResource(userModel, user).then(doc => {
    assert.ok(doc.id, 'an id was assigned to the user');
    assert.end();
  });
});

test(`find(userModel) then findResource(userModel, :firstId) then updateResource(userModel, :firstId) then deleteResource(userModel, :firstId)`, assert => {
  adapter.find(userModel).then(docs => {
    assert.equal(docs.length, 1, 'should be one user in database');

    const id = docs[0].id;
    adapter.findResource(userModel, id).then(doc => {
      assert.deepEqual(doc, {
        'name': 'Billy Smith',
        'email': 'bs@gmail.com',
        'id': `${id}`,
      }, 'user is looking good');

      adapter.updateResource(userModel, id, { name: 'Bobby Smith' }).then(update => {
        assert.ok(update, 'update was successfull');

        adapter.deleteResource(userModel, id).then(deletion => {
          assert.ok(deletion, 'deletion was successfull');
          assert.end();
        });
      });
    });
  });
});

test(`find(userModel) should be empty`, assert => {
  adapter.find(userModel).then(docs => {
    assert.equal(docs.length, 0, 'no users in database');
    assert.end();
  });
});

after('Disconnect adapter from database', assert => {
  adapter.disconnect().then(() => {
    assert.notOk(adapter.db, 'internal db object deleted');
    assert.end();
  }, err => {
    assert.error(err, 'no error disconnecting database');
    assert.fail('error disconnecting database');
    assert.end();
  });
});
