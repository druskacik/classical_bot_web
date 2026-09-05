const Model = require('objection').Model;
const knex = require('../utils/connection.cjs')

Model.knex(knex);

class Composer extends Model {
  static get tableName() {
    return 'composer';
  }

  static get relationMappings() {

    const ClassicalConcert = require('./ClassicalConcert.cjs');

    return {
        classicalConcerts: {
            relation: Model.ManyToManyRelation,
            modelClass: ClassicalConcert,
            join: {
              from: 'composer.id',
              through: {
                from: 'classical_concert_composer.classical_concert_id',
                to: 'classical_concert_composer.composer_id',
              },
              to: 'classical_concert.id',
            },
          },
    }
  }
}

module.exports = Composer;
