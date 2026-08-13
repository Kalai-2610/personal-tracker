const { MongoClient, Db, Collection } = require('mongodb');
const CacheMechanism = require('./cache');
const { hashPasswordArgon2i } = require('./crypt');

class MongoDB {
	static #URI;
	static #DB_NAME;
	static #NODE_ENV;
	/**
	 * Points to the current Database.
	 * @type {MongoClient}
	 */
	static #client;
	/**
	 * Points to the current Database.
	 * @type {Db}
	 */
	static db;
	/**
	 * Points to the users collection.
	 * @type {Collection}
	 */
	static users;
	/**
	 * Points to the sessions collection.
	 * @type {Collection}
	 */
	static sessions;
	/**
	 * Points to the logs collection.
	 * @type {Collection}
	 */
	static logs;
	/**
	 * Points to the category collection.
	 * @type {Collection}
	 */
	static lookups;
	/**
	 * Points to the category collection.
	 * @type {Collection}
	 */
	static expenses;
	/**
	 * @type {Object}
	 */
	static LOOK_UP_CREATOR;
	/**
	 * @type {Object}
	 */
	static LOOK_UP_UPDATOR;
	/**
	 * @type {Object}
	 */
	static SET;

	static async initialize() {
		const system_collections = [
			'_users',
			'_sessions',
			'_logs',
			'_lookups',
			'expenses',
		];
		const system_keys = [
			'_id',
			'_created_by',
			'_createdBy',
			'_created_on',
			'_updated_by',
			'_updatedBy',
			'_updated_on',
			'_expire_on',
			'is_active'
		];
		CacheMechanism.set('system_collections', system_collections);
		CacheMechanism.set('system_keys', system_keys);
		const logs_options = {
			timeseries: {
				timeField: 'timestamp', // required
				granularity: 'seconds' // seconds | minutes | hours
			}
		};
		await MongoDB.#client.connect()

		MongoDB.db = MongoDB.#client.db(MongoDB.#DB_NAME);
		console.log('DB Connection Established');
		const collections = (await MongoDB.db.listCollections().toArray()).map((item) => item.name);
		console.log('Collections: ', JSON.stringify(collections));
		const collections_toCreate = system_collections.filter((item) => !collections.includes(item));
		console.log('Collections to Create: ', JSON.stringify(collections_toCreate));
		await Promise.all(
			collections_toCreate.map(async (item) => {
				if (item === '_logs') {
					await MongoDB.db.createCollection(item, logs_options);
				} else {
					await MongoDB.db.createCollection(item);
				}
				console.log('System Collection created: ', item);
				if (item === '_users') {
					const { salt, hash } = await hashPasswordArgon2i(process.env.ADMIN_PASSWORD.trim());
					await MongoDB.db.collection(item).insertOne({
						name: 'System',
						email: 'Administrator',
						salt,
						hash,
						is_active: true,
						// is_admin: true,
						_created_on: new Date().toISOString(),
						_updated_on: new Date().toISOString()
					});
					console.log('System User created');
				}
			})
		);

		
		try {
			await MongoDB.db.command({ ping: 1 });
			MongoDB.logs = MongoDB.db.collection('_logs');
			MongoDB.users = MongoDB.db.collection('_users');
			MongoDB.sessions = MongoDB.db.collection('_sessions');
			MongoDB.lookups = MongoDB.db.collection('_lookups');
			MongoDB.expenses = MongoDB.db.collection('expenses');
			const systemUser = await MongoDB.users.findOne({ email: 'Administrator' });
			CacheMechanism.set('systemUser', systemUser);
			console.log('System Collections are initialized');
		} catch (err) {
			console.error('Database connection failed:', err);
		}

	}

	constructor() {
		MongoDB.#NODE_ENV = CacheMechanism.get('NODE_ENV');
		MongoDB.#URI = process.env.DATABASE.trim()
			.replaceAll('<DB_USER>', process.env.DB_USER.trim())
			.replaceAll('<DB_PASSWORD>', process.env.DB_PASSWORD.trim());
		if (MongoDB.#NODE_ENV === 'production') {
			MongoDB.#DB_NAME = process.env.PROD_DB_NAME.trim();
		} else {
			MongoDB.#DB_NAME = process.env.DB_NAME.trim();
		}
		console.log('ENV = ', MongoDB.#NODE_ENV);
		console.log('DB_NAME = ', MongoDB.#DB_NAME);
		MongoDB.#URI = MongoDB.#URI.replaceAll('<DB_NAME>', MongoDB.#DB_NAME);
		MongoDB.#client = new MongoClient(MongoDB.#URI);
		MongoDB.LOOK_UP_CREATOR = {
			$lookup: {
				from: '_users',
				let: { creatorId: '$_created_by' },
				pipeline: [
					{ $match: { $expr: { $eq: ['$_id', '$$creatorId'] } } },
					{ $project: { name: 1, email: 1, _id: 1, is_active: 1 } } // remove salt & hash from joined Collection
				],
				as: '_createdBy'
			}
		};
		MongoDB.LOOK_UP_UPDATOR = {
			$lookup: {
				from: '_users',
				let: { updatorId: '$_updated_by' },
				pipeline: [
					{ $match: { $expr: { $eq: ['$_id', '$$updatorId'] } } },
					{ $project: { name: 1, email: 1, _id: 1, is_active: 1 } } // remove salt & hash from joined Collection
				],
				as: '_updatedBy'
			}
		};
		MongoDB.SET = {
			$set: {
				_createdBy: { $first: '$_createdBy' },
				_updatedBy: { $first: '$_updatedBy' }
			}
		};
	}
}

module.exports = MongoDB;
