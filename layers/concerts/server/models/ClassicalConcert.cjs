const Model = require('objection').Model;
const knex = require('../utils/connection.cjs')

Model.knex(knex);

class ClassicalConcert extends Model {
  static get tableName() {
    return 'classical_concert';
  }

  static get relationMappings() {

    const Composer = require('./Composer.cjs');

    return {
        composers: {
            relation: Model.ManyToManyRelation,
            modelClass: Composer,
            join: {
              from: 'classical_concert.id',
              through: {
                from: 'classical_concert_composer.classical_concert_id',
                to: 'classical_concert_composer.composer_id',
              },
              to: 'composer.id',
            },
          },
    }
  }
}

module.exports = ClassicalConcert;
