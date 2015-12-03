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

test(`create`, assert => {
  adapter.create(person, {
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

    return adapter.create(animal, {
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

    return adapter.create(person, {
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

    return adapter.create(animal, {
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

test('retrieve(person)', assert => {
  adapter.retrieve(person).then(people => {
    assert.equal(people.length, 2, 'two people retrieved');

    return adapter.retrieve(person, [people[0].id, people[1].id]);
  }).then(people => {
    assert.equal(people.length, 2, 'two people retrieved');

    return adapter.retrieve(person, people[0].id);
  }).then(person => {
    assert.deepEqual(person, {
      id: person.id,
      name: 'Billy',
      email: 'b@gmail.com',
    }, 'retrieved person looks good');
    assert.end();
  });
});

test(`find(person) then findResource(person, :firstId) then updateResource(person, :firstId) then deleteResource(person, :firstId)`, assert => {
  adapter.find(person).then(people => {
    assert.equal(people.length, 2, 'should be two people in database');

    return adapter.findRecord(person, people[0].id);
  }).then(doc => {
    assert.deepEqual(doc, {
      id: `${doc.id}`,
      name: 'Billy',
      email: 'b@gmail.com',
    }, 'first person in database has good looking json');

    return adapter.update(person, doc.id, {
      name: 'Bobby',
    });
  }).then(doc => {
    assert.deepEqual(doc, {
      id: `${doc.id}`,
      name: 'Bobby',
      email: 'b@gmail.com',
    }, 'first user attributes changed properly');

    return adapter.delete(person, doc.id);
  }).then(success => {
    assert.ok(success, 'user successfully deleted');

    return adapter.find(person);
  }).then(docs => {
    assert.equal(docs.length, 1, 'only one person in the database now');
    assert.end();
  });
});

test(`update relationships`, assert => {
  Promise.props({
    people: adapter.find(person),
    animals: adapter.find(animal),
  }).then(({ people, animals }) => {
    const responses = [[{
      id: people[0].id,
      name: 'Jimmy',
      email: 'j@gmail.com',
      pets: [{
        id: people[0].pets[0].id,
        species: 'Dog',
        owner: people[0].pets[0].owner,
        age: 5,
      }],
    }], [{
      id: animals[0].id,
      species: 'Dog',
      age: 5,
      owner: undefined,
    }, {
      id: animals[1].id,
      species: 'Zebra',
      age: 14,
    }]];

    responses[0].count = 1;
    responses[1].count = 2;

    assert.deepEqual(people, responses[0], 'retrieved people look good');
    assert.deepEqual(animals, responses[1], 'retrieved animals look good');

    return Promise.props({
      person: adapter.update(person, people[0].id, { pets: [ animals[0].id ] }),
      animal: adapter.update(animal, animals[0].id, { owner: people[0].id }),
    });
  }).then(({ person, animal }) => {
    const responses = [{
      id: person.id,
      name: 'Jimmy',
      email: 'j@gmail.com',
      pets: [{
        id: person.pets[0].id,
        species: 'Dog',
        owner: person.pets[0].owner,
        age: 5,
      }],
    }, {
      id: animal.id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animal.owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: [ animal.owner.pets[0] ],
      },
    }];

    assert.deepEqual(person, responses[0], 'updated person look good');
    assert.deepEqual(animal, responses[1], 'updated animal look good');
    assert.end();
  });
});

test('sort', assert => {
  adapter.find(animal, {
    sort: { species: 'desc' },
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Zebra',
      age: 14,
    }, {
      id: animals[1].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[1].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[1].owner.pets,
      },
    }];

    response.count = 2;
    assert.deepEqual(animals, response, 'sorted animals looks good');

    return adapter.find(animal, {
      sort: { species: 'asc' },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[0].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[0].owner.pets,
      },
    }, {
      id: animals[1].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 2;
    assert.deepEqual(animals, response, 'sorted animals looks good');

    return adapter.find(animal, {
      sort: { age: 'asc' },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[0].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[0].owner.pets,
      },
    }, {
      id: animals[1].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 2;
    assert.deepEqual(animals, response, 'sorted animals looks good');

    return adapter.find(animal, {
      sort: { age: 'desc' },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Zebra',
      age: 14,
    }, {
      id: animals[1].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[1].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[1].owner.pets,
      },
    }];

    response.count = 2;
    assert.deepEqual(animals, response, 'sorted animals looks good');

    return adapter.find(animal, {
      sort: { species: 'asc', age: 'desc' },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[0].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[0].owner.pets,
      },
    }, {
      id: animals[1].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 2;
    assert.deepEqual(animals, response, 'sorted animals looks good');
    assert.end();
  });
});

test('filter', assert => {
  adapter.find(animal, {
    filter: { age: 14 },
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 1;
    assert.deepEqual(animals, response, 'filtered animals looks good');

    return adapter.find(animal, {
      filter: { age: { $lt: 14 } },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[0].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[0].owner.pets,
      },
    }];

    response.count = 1;
    assert.deepEqual(animals, response, 'filtered animals looks good');

    return adapter.find(animal, {
      filter: { age: { $gt: 10, $lt: 20 } },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 1;
    assert.deepEqual(animals, response, 'filtered animals looks good');

    return adapter.find(animal, {
      filter: { age: { $lte: 14 }, species: 'Zebra' },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 1;
    assert.deepEqual(animals, response, 'filtered animals looks good');

    return adapter.find(animal, {
      filter: { age: { $lte: 20 }, species: { $in: [ 'Dog', 'Panther' ] } },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[0].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[0].owner.pets,
      },
    }];

    response.count = 1;
    assert.deepEqual(animals, response, 'filtered animals looks good');

    return adapter.find(animal, {
      filter: { species: { $nin: [ 'Dog', 'Zebra' ] } },
    });
  }).then(animals => {
    const response = [];

    response.count = 0;
    assert.deepEqual(animals, response, 'filtered animals looks good');
    assert.end();
  });
});

test('fields', assert => {
  adapter.find(person, {
    fields: {
      name: false,
      pets: false,
    },
  }).then(people => {
    const response = [{
      id: people[0].id,
      email: 'j@gmail.com',
    }];

    response.count = 1;
    assert.deepEqual(people, response, 'fields people looks good');
    assert.end();
  });
});

test('paginate', assert => {
  adapter.find(animal, {
    page: { offset: 0, limit: 2 },
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[0].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[0].owner.pets,
      },
    }, {
      id: animals[1].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 2;
    assert.deepEqual(animals, response, 'paginated animals looks good');

    return adapter.find(animal, {
      page: { offset: 1, limit: 2 },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 2;
    assert.deepEqual(animals, response, 'paginated animals looks good');

    return adapter.find(animal, {
      page: { offset: 2, limit: 2 },
    });
  }).then(animals => {
    const response = [];

    response.count = 2;
    assert.deepEqual(animals, response, 'paginated animals looks good');

    return adapter.find(animal, {
      page: { offset: 0, limit: 1 },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Dog',
      age: 5,
      owner: {
        id: animals[0].owner.id,
        name: 'Jimmy',
        email: 'j@gmail.com',
        pets: animals[0].owner.pets,
      },
    }];

    response.count = 2;
    assert.deepEqual(animals, response, 'paginated animals looks good');

    return adapter.find(animal, {
      filter: { species: 'Zebra' },
      page: { offset: 0, limit: 1 },
    });
  }).then(animals => {
    const response = [{
      id: animals[0].id,
      species: 'Zebra',
      age: 14,
    }];

    response.count = 1;
    assert.deepEqual(animals, response, 'paginated animals looks good');
    assert.end();
  });
});

after(`disconnect adapter from database`, assert => {
  app.disconnect().then(() => {
    assert.notOk(app.adapter.db, 'internal db object deleted');
    assert.end();
  });
});
