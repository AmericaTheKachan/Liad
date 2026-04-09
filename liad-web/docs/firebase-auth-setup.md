# Firebase Auth Setup

## Variaveis de ambiente

Crie um arquivo `.env` na raiz do projeto usando `.env.example` como base:

```env
PORT=3000
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
FIREBASE_MEASUREMENT_ID=
```

## Estrutura usada pelo app

- `accounts/{cnpjNormalized}`: dados da empresa
- `users/{uid}`: ponte para localizar a conta do usuario autenticado

## Regras recomendadas do Firestore

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function isCurrentUser(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }

    function isValidVisitsRange(value) {
      return value in [
        '0_1k',
        '1k_10k',
        '10k_50k',
        '50k_200k',
        '200k_plus'
      ];
    }

    match /accounts/{accountId} {
      allow get: if isSignedIn() && resource.data.ownerUid == request.auth.uid;
      allow list: if false;

      allow create, update: if isSignedIn()
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.cnpjNormalized == accountId
        && request.resource.data.storeName is string
        && request.resource.data.storeName.size() >= 2
        && request.resource.data.storeName.size() <= 100
        && request.resource.data.ownerFirstName is string
        && request.resource.data.ownerFirstName.size() >= 2
        && request.resource.data.ownerFirstName.size() <= 50
        && request.resource.data.ownerLastName is string
        && request.resource.data.ownerLastName.size() >= 2
        && request.resource.data.ownerLastName.size() <= 80
        && request.resource.data.email is string
        && request.resource.data.cnpj is string
        && request.resource.data.cnpjNormalized.matches('^[0-9]{14}$')
        && request.resource.data.provider in ['google', 'password']
        && request.resource.data.profileCompleted is bool
        && isValidVisitsRange(request.resource.data.monthlyVisitsRange);

      allow delete: if false;
    }

    match /users/{uid} {
      allow get: if isCurrentUser(uid);
      allow list: if false;

      allow create, update: if isCurrentUser(uid)
        && request.resource.data.accountId is string
        && request.resource.data.email is string
        && request.resource.data.storeName is string
        && request.resource.data.ownerFirstName is string
        && request.resource.data.ownerLastName is string
        && request.resource.data.provider in ['google', 'password'];

      allow delete: if false;
    }
  }
}
```

## Regras recomendadas do Firebase Storage

O upload da logo da loja usa o caminho:

- `accounts/{accountId}/store-logo/{timestamp}-{fileName}`

Como o app salva o `accountId` no documento `users/{uid}`, a regra abaixo permite que o usuario autenticado leia e altere apenas os arquivos da propria conta:

```js
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function isSignedIn() {
      return request.auth != null;
    }

    function accountIdFromUserProfile() {
      return firestore.get(
        /databases/(default)/documents/users/$(request.auth.uid)
      ).data.accountId;
    }

    function belongsToAccount(accountId) {
      return isSignedIn() && accountIdFromUserProfile() == accountId;
    }

    match /accounts/{accountId}/store-logo/{fileName} {
      allow read: if belongsToAccount(accountId);

      allow create, update: if belongsToAccount(accountId)
        && request.resource.size <= 2 * 1024 * 1024
        && request.resource.contentType.matches('image/(jpeg|png|svg\\+xml)');

      allow delete: if belongsToAccount(accountId);
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## Fluxos implementados

- `/login`: login com Google ou email e senha
- `/cadastro`: criacao de conta com validacoes
- `/completar-cadastro`: onboarding complementar apos Google
- `/dashboard`: tela temporaria protegida com botao de logout

## Solucao para "Missing or insufficient permissions"

Se o usuario aparece criado em `Authentication`, mas o login falha com `Missing or insufficient permissions`, quase sempre significa que:

1. o `createUserWithEmailAndPassword` funcionou
2. o `writeBatch` no Firestore falhou
3. as regras das colecoes `accounts` e `users` nao foram publicadas ou nao correspondem a estrutura acima

Nesse caso:

1. publique as rules deste arquivo
2. abra `Authentication > Users`
3. remova o usuario que ficou criado pela tentativa anterior
4. tente o cadastro novamente
