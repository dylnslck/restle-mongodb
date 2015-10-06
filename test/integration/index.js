import Adapter from '../../../dist/lib';
import Restle from 'restle';
import Promise from 'bluebird';
import flushCollections from '../helpers/flush-collections';
import schemas from '../helpers/schemas';
import mongodb from 'mongodb';
import test from 'tape';
import before from 'tape';
import after from 'tape';

const url = 'mongodb://restle:restle@ds035613.mongolab.com:35613/restle-dev';

const adapter = new Adapter({ url });
const app = new Restle({ adapter });

const person = app.register('person', schemas.person);
const animal = app.register('animal', schemas.animal);
const building = app.register('building', schemas.building);
const habitat = app.register('habitat', schemas.habitat);
const company = app.register('company', schemas.company);
const country = app.register('country', schemas.country);

before('flush collections', assert => {
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

test(`find(person) should be empty`, assert => {
  adapter.find(person).then(docs => {
    assert.equal(docs.length, 0, 'no users in database');
    assert.end();
  });
});

test(`createResource`, assert => {
  adapter.createResource(person, {
    name: 'Billy',
    email: 'b@gmail.com',
  })

  // create person with no relationships
  .then(doc => {
    assert.deepEqual(doc, {
      name: 'Billy',
      email: 'b@gmail.com',
      id: `${doc.id}`,
    }, 'created person with no relationships has good looking json');

    return adapter.createResource(animal, {
      species: 'Dog',
      age: 5,
      owner: `${doc.id}`,
    });
  })

  // create animal with to-one relationship
  .then(doc => {
    assert.deepEqual(doc, {
      species: 'Dog',
      age: 5,
      id: `${doc.id}`,
      owner: {
        id: `${doc.owner.id}`,
        name: 'Billy',
        email: 'b@gmail.com',
      },
    }, 'created animal with to-one has good looking json');

    return adapter.createResource(person, {
      name: 'Jimmy',
      email: 'j@gmail.com',
      pets: [ `${doc.id}` ],
    });
  })

  // create person with to-many relationship
  .then(doc => {
    assert.deepEqual(doc, {
      name: 'Jimmy',
      email: 'j@gmail.com',
      id: `${doc.id}`,
      pets: [{
        id: `${doc.pets[0].id}`,
        species: 'Dog',
        owner: `${doc.pets[0].owner}`,
        age: 5,
      }],
    }, 'created person with to-many has good looking json');

    return adapter.createResource(animal, {
      species: 'Zebra',
      age: 14,
    });
  })

  // create animal with no relationships
  .then(doc => {
    assert.ok(doc.id, 'zebra was created');
    assert.end();
  })

  // failed creating a resource
  .catch(err => {
    assert.fail(err);
  });
});

test(`find(person) then findResource(person, :firstId) then updateResource(person, :firstId) then deleteResource(person, :firstId)`, assert => {
  adapter.find(person)

  // retrieve all people
  .then(docs => {
    assert.equal(docs.length, 2, 'should be two people in database');

    return adapter.findResource(person, docs[0].id);
  })

  // retrieve first person
  .then(doc => {
    assert.deepEqual(doc, {
      id: `${doc.id}`,
      name: 'Billy',
      email: 'b@gmail.com',
    }, 'first person in database has good looking json');

    return adapter.updateResource(person, doc.id, {
      name: 'Bobby',
    });
  })

  // update user
  .then(success => {
    assert.ok(success, 'user successfully updated');
  })

  // find people to make sure attributes changed
  .then(() => {
    return adapter.find(person);
  })

  .then(docs => {
    assert.deepEqual(docs[0], {
      id: `${docs[0].id}`,
      name: 'Bobby',
      email: 'b@gmail.com',
    }, 'first user attributes changed properly');

    return adapter.deleteResource(person, docs[0].id);
  })

  // successfully deleted
  .then(success => {
    assert.ok(success, 'user successfully deleted');

    return adapter.find(person);
  })

  // make sure only one user in the db now
  .then(docs => {
    assert.equal(docs.length, 1, 'only one person in the database now');
    assert.end();
  })

  // catch errors
  .catch(errors => {
    assert.fail(errors);
  });
});

test(`setRelationship`, assert => {
  Promise.props({
    people: adapter.find(person),
    animals: adapter.find(animal),
  })

  .then(docs => {
    return adapter.setRelationship(animal, docs.animals[0].id, 'owner', docs.people[0].id);
  })

  .then(success => {
    assert.ok(success, 'successfully set the new owner');

    return Promise.props({
      people: adapter.find(person),
      animals: adapter.find(animal),
    });
  })

  .then(docs => {
    assert.deepEqual(docs.animals[0], {
      id: `${docs.animals[0].id}`,
      species: 'Dog',
      age: 5,
      owner: {
        id: `${docs.people[0].id}`,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: [ `${docs.animals[0].id}` ],
      },
    }, 'animal json looks good with new owner');

    assert.end();
  });
});

test(`findRelated`, assert => {
  adapter.find(animal)

  .then(docs => {
    return adapter.findRelated(animal, docs[0].id, 'owner');
  })

  .then(doc => {
    assert.deepEqual(doc, {
      id: `${doc.id}`,
      name: 'Jimmy',
      email: 'j@gmail.com',
      pets: [{
        id: `${doc.pets[0].id}`,
        species: 'Dog',
        age: 5,
        owner: `${doc.pets[0].owner}`,
      }],
    }, 'pets owner has good looking json');

    return adapter.find(person);
  })

  .then(docs => {
    return adapter.findRelated(person, docs[0].id, 'pets');
  })

  .then(docs => {
    assert.deepEqual(docs, [{
      id: `${docs[0].id}`,
      species: 'Dog',
      age: 5,
      owner: {
        id: `${docs[0].owner.id}`,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: [ `${docs[0].id}` ],
      },
    }], 'person pets has good looking json');

    assert.end();
  });
});

test(`appendRelationship`, assert => {
  Promise.props({
    people: adapter.find(person),
    animals: adapter.find(animal),
  })

  .then(docs => {
    assert.deepEqual(docs.people[0], {
      id: `${docs.people[0].id}`,
      name: 'Jimmy',
      email: 'j@gmail.com',
      pets: [{
        id: `${docs.animals[0].id}`,
        species: 'Dog',
        age: 5,
        owner: `${docs.people[0].id}`,
      }],
    }, 'first person has one pet and good looking json');

    return adapter.appendRelationship(person, docs.people[0].id, 'pets', docs.animals[1].id);
  })

  .then(success => {
    assert.ok(success, 'successfully appended relationship');

    return Promise.props({
      people: adapter.find(person),
      animals: adapter.find(animal),
    });
  })

  .then(docs => {
    assert.deepEqual(docs.people[0], {
      id: `${docs.people[0].id}`,
      name: 'Jimmy',
      email: 'j@gmail.com',
      pets: [{
        id: `${docs.animals[0].id}`,
        species: 'Dog',
        age: 5,
        owner: `${docs.people[0].id}`,
      }, {
        id: `${docs.animals[1].id}`,
        species: 'Zebra',
        age: 14,
      }],
    }, 'first person has two pets and good looking json');

    assert.end();
  });
});

test(`deleteRelationship`, assert => {

});

after(`disconnect adapter from database`, assert => {
  app.disconnect().then(() => {
    assert.notOk(app.adapter.db, 'internal db object deleted');
    assert.end();
  });
});
