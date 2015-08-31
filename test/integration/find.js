import Adapter from '../../../dist/lib';
import flushCollections from '../helpers/flush-collections';
import mongodb from 'mongodb';
import test from 'tape';
import init from 'tape';
import before from 'tape';
import after from 'tape';
import prettyjson from 'prettyjson';
import _ from 'lodash';

const url = 'mongodb://restle:restle@ds035613.mongolab.com:35613/restle-dev';

const adapter = new Adapter({ url });

// mockups
const vehicleModel = {
  type: 'vehicle',
  getRelationship(type) {
    return this.relationships[type];
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
      },
    };

    return relationships[type];
  },
  hasRelationship(type) {
    return !!this.getRelationship(type);
  },
};

const userModel = {
  type: 'user',
  relationships: {
    posts: {
      type: 'post',
      model: postModel,
      isMany: true,
    },
    car: {
      type: 'vehicle',
      model: vehicleModel,
      isMany: false,
    }
  },
  getRelationship(type) {
    return this.relationships[type];
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

test(`createResource(postModel) then createResource(vehicleModel) then createResource(userModel) three times`, assert => {
  const post = {
    'title': 'Awesome Title',
  };

  const car = {
    'color': 'Yellow',
    'make': 'Honda',
  };

  adapter.createResource(postModel, post).then(savedPost => {
    const postId = savedPost.id;
    assert.ok(postId, 'saved post has an id');

    adapter.createResource(vehicleModel, car).then(savedCar => {
      const carId = savedCar.id;
      assert.ok(carId, 'saved car has an id');

      let firstUser = {
        'name': 'Some User',
        'email': 'user@email.com',
        'posts': [ postId ],
        'car': carId,
      };

      let secondUser = {
        'name': 'Some User',
        'email': 'user@email.com',
        'car': carId,
      };

      let thirdUser = {
        'name': 'Some User',
        'email': 'user@email.com',
        'posts': [ postId ],
      };

      adapter.createResource(userModel, firstUser).then(savedFirstUser => {
        assert.ok(savedFirstUser.id, 'an id was assigned to the first user');

        adapter.createResource(userModel, secondUser).then(savedSecondUser => {
          assert.ok(savedSecondUser.id, 'an id was assigned to the second user');

          adapter.createResource(userModel, thirdUser).then(savedThirdUser => {
            assert.ok(savedThirdUser.id, 'an id was assigned to the third user');
            assert.end();
          });
        });
      });
    });
  });
});

test(`find(userModel)`, assert => {
  adapter.find(userModel).then(users => {
    assert.equal(users.length, 3, 'there should be three users in the database');

    assert.deepEqual(users, [{
      id: users[0].id,
      name: 'Some User',
      email: 'user@email.com',
      posts: [{
        id: users[0].posts[0].id,
        title: 'Awesome Title',
      }],
      car: {
        color: 'Yellow',
        make: 'Honda',
        id: users[0].car.id,
      },
    }, {
      id: users[1].id,
      name: 'Some User',
      email: 'user@email.com',
      car: {
        color: 'Yellow',
        make: 'Honda',
        id: users[1].car.id,
      },
    }, {
      id: users[2].id,
      name: 'Some User',
      email: 'user@email.com',
      posts: [{
        id: users[2].posts[0].id,
        title: 'Awesome Title',
      }],
    }], 'users look good');
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
