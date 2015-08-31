import Adapter from '../../../dist/lib';
import flushCollections from '../helpers/flush-collections';
import mongodb from 'mongodb';
import test from 'tape';
import init from 'tape';
import before from 'tape';
import after from 'tape';
import _ from 'lodash';

const url = 'mongodb://restle:restle@ds035613.mongolab.com:35613/restle-dev';

const adapter = new Adapter({ url });

// mockups
const postModel = {
  type: 'post',
  relationships: {
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
  },
  getRelationship(type) {
    return this.relationships[type];
  },
  hasRelationship(type) {
    return !!this.getRelationship(type);
  },
};

const vehicleModel = {
  type: 'vehicle',
  getRelationship(type) {
    return this.relationships[type];
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

test(`find(userModel) should be empty and find(postModel) should be empty`, assert => {
  adapter.find(userModel).then(users => {
    assert.equal(users.length, 0, 'no users in database');

    adapter.find(postModel).then(posts => {
      assert.equal(posts.length, 0, 'no posts in database');
      assert.end();
    });
  });
});

test(`createResource(userModel) then createResource(carModel) then createResource(postModel) then appendRelationship(userModel, 'posts', :postId)`, assert => {
  const user = {
    'name': 'Some Name',
    'email': 'some@name.com',
  };

  const post = {
    'title': 'Awesome Title',
  };

  const car = {
    'color': 'Yellow',
    'make': 'Lamborghini',
  };

  adapter.createResource(userModel, user).then(savedUser => {
    const userId = savedUser.id;
    assert.ok(userId, 'an id was assigned to the user');

    adapter.createResource(vehicleModel, car).then(savedCar => {
      const carId = savedCar.id;

      adapter.createResource(postModel, post).then(savedPost => {
        const postId = savedPost.id;
        assert.ok(postId, 'an id was assigned to the post');

        adapter.appendRelationship(userModel, userId, 'posts', postId).then(success => {
          assert.ok(success, 'posts relationship successfully added');

          adapter.appendRelationship(userModel, userId, 'car', carId).then(success => {
            assert.ok(success, 'car relationship successfully added');

            adapter.findResource(userModel, userId).then(foundUser => {
              assert.deepEqual(foundUser, {
                id: foundUser.id,
                name: 'Some Name',
                email: 'some@name.com',
                posts: [{
                  id: foundUser.posts[0].id,
                  title: 'Awesome Title',
                }],
                car: {
                  id: foundUser.car.id,
                  color: 'Yellow',
                  make: 'Lamborghini',
                },
              }, 'found user looks good');
              assert.end();
            });
          });
        });
      });
    });
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
