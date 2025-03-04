import gql from 'graphql-tag';
import {
  defaultRootOperationTypes,
  replaceExtendedDefinitionsWithExtensions,
  normalizeTypeDefs,
  stripFederationPrimitives,
} from '../normalize';
import { astSerializer } from '../../snapshotSerializers';

expect.addSnapshotSerializer(astSerializer);

describe('SDL normalization and its respective parts', () => {
  describe('defaultRootOperationTypes', () => {
    it('transforms defined root operation types to respective extended default root operation types', () => {
      const typeDefs = gql`
        schema {
          query: RootQuery
          mutation: RootMutation
        }

        type RootQuery {
          product: Product
        }

        type Product {
          sku: String
        }

        type RootMutation {
          updateProduct: Product
        }
      `;

      const schemaWithDefaultedRootOperationTypes = defaultRootOperationTypes(
        typeDefs,
      );
      expect(schemaWithDefaultedRootOperationTypes).toMatchInlineSnapshot(`
        extend type Query {
          product: Product
        }

        type Product {
          sku: String
        }

        extend type Mutation {
          updateProduct: Product
        }
      `);
    });

    it('removes all types using a default root operation type name when a schema definition is provided (root types are defined by the user)', () => {
      const typeDefs = gql`
        schema {
          query: RootQuery
        }

        type RootQuery {
          product: Product
        }

        type Product {
          sku: String
        }

        type Query {
          removeThisEntireType: String
        }

        type Mutation {
          removeThisEntireType: String
        }

        type Subscription {
          removeThisEntireType: String
        }
      `;

      const schemaWithDefaultedRootOperationTypes = defaultRootOperationTypes(
        typeDefs,
      );
      expect(schemaWithDefaultedRootOperationTypes).toMatchInlineSnapshot(`
        extend type Query {
          product: Product
        }

        type Product {
          sku: String
        }
      `);
    });

    it('drops fields that reference an invalid default root operation type name', () => {
      const typeDefs = gql`
        schema {
          query: RootQuery
          mutation: RootMutation
        }

        type RootQuery {
          product: Product
        }

        type Query {
          removeThisEntireType: String
        }

        type RootMutation {
          keepThisField: String
          removeThisField: Query
        }
      `;

      const schemaWithDefaultedRootOperationTypes = defaultRootOperationTypes(
        typeDefs,
      );
      expect(schemaWithDefaultedRootOperationTypes).toMatchInlineSnapshot(`
        extend type Query {
          product: Product
        }

        extend type Mutation {
          keepThisField: String
        }
      `);
    });
  });

  describe('replaceExtendedDefinitionsWithExtensions', () => {
    it('transforms the @extends directive into type extensions', () => {
      const typeDefs = gql`
        type Product @extends @key(fields: "sku") {
          sku: String @external
        }
      `;

      expect(replaceExtendedDefinitionsWithExtensions(typeDefs))
        .toMatchInlineSnapshot(`
        extend type Product @key(fields: "sku") {
          sku: String @external
        }
      `);
    });
  });

  describe('stripFederationPrimitives', () => {
    it(`removes all federation directive definitions`, () => {
      const typeDefs = gql`
        directive @key(fields: _FieldSet!) on OBJECT | INTERFACE
        directive @external on FIELD_DEFINITION
        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
        directive @extends on OBJECT | INTERFACE

        type Query {
          thing: String
        }
      `;

      expect(stripFederationPrimitives(typeDefs)).toMatchInlineSnapshot(`
        type Query {
          thing: String
        }
      `);
    });

    it(`doesn't remove custom directive definitions`, () => {
      const typeDefs = gql`
        directive @custom on OBJECT

        type Query {
          thing: String
        }
      `;

      expect(stripFederationPrimitives(typeDefs)).toMatchInlineSnapshot(`
        directive @custom on OBJECT

        type Query {
          thing: String
        }
      `);
    });

    it(`removes all federation type definitions (scalars, unions, object types)`, () => {
      const typeDefs = gql`
        scalar _Any
        scalar _FieldSet

        union _Entity

        type _Service {
          sdl: String
        }

        type Query {
          thing: String
        }
      `;

      expect(stripFederationPrimitives(typeDefs)).toMatchInlineSnapshot(`
        type Query {
          thing: String
        }
      `);
    });

    it(`doesn't remove custom scalar, union, or object type definitions`, () => {
      const typeDefs = gql`
        scalar CustomScalar

        type CustomType {
          field: String!
        }

        union CustomUnion

        type Query {
          thing: String
        }
      `;

      expect(stripFederationPrimitives(typeDefs)).toMatchInlineSnapshot(`
        scalar CustomScalar

        type CustomType {
          field: String!
        }

        union CustomUnion

        type Query {
          thing: String
        }
      `);
    });

    it(`removes all federation field definitions (_service, _entities)`, () => {
      const typeDefs = gql`
        type Query {
          _service: _Service!
          _entities(representations: [_Any!]!): [_Entity]!
          thing: String
        }
      `;

      expect(stripFederationPrimitives(typeDefs)).toMatchInlineSnapshot(`
        type Query {
          thing: String
        }
      `);
    });

    it(`removes the Query type altogether if it has no fields left after normalization`, () => {
      const typeDefs = gql`
        type Query {
          _service: _Service!
          _entities(representations: [_Any!]!): [_Entity]!
        }

        type Custom {
          field: String
        }
      `;

      expect(stripFederationPrimitives(typeDefs)).toMatchInlineSnapshot(`
        type Custom {
          field: String
        }
      `);
    });
  });

  describe('normalizeTypeDefs', () => {
    it('integration', () => {
      const typeDefsToNormalize = gql`
        directive @key(fields: _FieldSet!) on OBJECT | INTERFACE
        directive @external on FIELD_DEFINITION
        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
        directive @extends on OBJECT | INTERFACE

        scalar _Any
        scalar _FieldSet

        union _Entity

        type _Service {
          sdl: String
        }

        schema {
          query: RootQuery
          mutation: RootMutation
        }

        type RootQuery {
          _service: _Service!
          _entities(representations: [_Any!]!): [_Entity]!
          product: Product
        }

        type Product @extends @key(fields: "sku") {
          sku: String @external
        }

        type RootMutation {
          updateProduct: Product
        }
      `;

      const normalized = normalizeTypeDefs(typeDefsToNormalize);

      expect(normalized).toMatchInlineSnapshot(`
        extend type Query {
          product: Product
        }

        extend type Product @key(fields: "sku") {
          sku: String @external
        }

        extend type Mutation {
          updateProduct: Product
        }
      `);
    });

    it('should allow schema describing default types', () => {
      const typeDefsToNormalize = gql`
        schema {
          query: Query
          mutation: Mutation
        }

        type Query {
          product: Product
        }

        type Product @extends @key(fields: "sku") {
          sku: String @external
        }

        type Mutation {
          updateProduct: Product
        }
      `;

      const normalized = normalizeTypeDefs(typeDefsToNormalize);

      expect(normalized).toMatchInlineSnapshot(`
        extend type Query {
          product: Product
        }

        extend type Product @key(fields: "sku") {
          sku: String @external
        }

        extend type Mutation {
          updateProduct: Product
        }
      `);
    });
  });
});
