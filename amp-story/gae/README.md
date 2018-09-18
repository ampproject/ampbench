Install dependencies:

```sh
$ npm run install-local-dependencies
$ npm install
```

Run locally:

```sh
$ tsc
$ npm run start
```

Run locally with restart on `*.hbs` or `*.js` change:

```sh
$ npm run watch
```

Deployment:

```sh
$ gcloud config set core/project PROJECT # set default project (if necessary)
$ npm run deploy
```
