#!/usr/bin/env node

import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { create } from 'domain';

interface UserInput {
  userName: string;
  userEmail: string;
  fullAppName: string; // e.g. @myorg/test-app
}

async function main() {
  const answers = await inquirer.prompt<UserInput>([
    {
      type: 'input',
      name: 'userName',
      message: 'Your name:'
    },
    {
      type: 'input',
      name: 'userEmail',
      message: 'Your email address:'
    },
    {
      type: 'input',
      name: 'fullAppName',
      message: 'Application name (format: @organization-name/app-name):'
    }
  ]);

  const { userName, userEmail, fullAppName } = answers;
  const trimmedAppName = fullAppName.replace(/^@/, '');
  const [organizationName, applicationName] = trimmedAppName.split('/');
  
  const camelAppApiName = toCamelCasePlusApi(applicationName); 
  const apiFileName = `${camelAppApiName}.ts`; 

  const pascalCaseAppName = toPascalCase(applicationName);

  const baseDir = path.join(process.cwd(), applicationName);
  createDirIfNotExists(baseDir);

  const manifestContent = {
    name: fullAppName,
    user: userName,
    email: userEmail
  };
  writeFileWithLog(
    path.join(baseDir, 'manifest.json'),
    JSON.stringify(manifestContent, null, 2)
  );

  const backendDir = path.join(baseDir, `${applicationName}-backend`);
  createDirIfNotExists(backendDir);

  createDirIfNotExists(path.join(backendDir, 'database'));
  createDirIfNotExists(path.join(backendDir, 'database', 'migrations'));
  createDirIfNotExists(path.join(backendDir, 'routes'));

  const backendSrcDir = path.join(backendDir, 'src');
  createDirIfNotExists(backendSrcDir);
  createDirIfNotExists(path.join(backendSrcDir, 'Controllers'));
  createDirIfNotExists(path.join(backendSrcDir, 'Models'));

  const serviceProviderPath = path.join(
    backendSrcDir,
    `${pascalCaseAppName}ServiceProvider.php`
  );
  const serviceProviderContent = `<?php

namespace ${toPascalCase(organizationName)}\\${pascalCaseAppName};

use ClarionApp\\Backend\\ClarionPackageServiceProvider;

class ${pascalCaseAppName}ServiceProvider extends ClarionPackageServiceProvider
{
    public function boot(): void
    {
        parent::boot();

        \$this->loadMigrationsFrom(__DIR__.'/../database/migrations');

        if(!\$this->app->routesAreCached())
        {
            require __DIR__.'/../routes/api.php';
        }
    }

    public function register(): void
    {
        parent::register();
    }
}
`;
  writeFileWithLog(serviceProviderPath, serviceProviderContent);

  // routes/api.php
  const routesPhp = `<?php

use Illuminate\\Support\\Facades\\Route;

Route::group(['middleware'=>['auth:api'], 'prefix'=>\$this->routePrefix ], function () {

});
`;
  writeFileWithLog(path.join(backendDir, 'routes/api.php'), routesPhp);

  const composerJson = {
    name: `${organizationName}/${applicationName}-backend`,
    description: "Describe your package",
    type: "library",
    license: "MIT",
    autoload: {
      "psr-4": {
        [`${toPascalCase(organizationName)}\\${pascalCaseAppName}\\`]: "src/"
      }
    },
    authors: [
      {
        name: userName,
        email: userEmail
      }
    ],
    require: {
      "clarion-app/eloquent-multichain-bridge": "dev-main",
      "clarion-app/backend": "dev-main"
    },
    extra: {
      laravel: {
        providers: [
          `${toPascalCase(organizationName)}\\${pascalCaseAppName}\\${pascalCaseAppName}ServiceProvider`
        ]
      },
      clarion: {
        "app-name": fullAppName,
        "description": "Provides operations to implement {user fills this in later}."
      }
    },
    "minimum-stability": "dev"
  };
  writeFileWithLog(
    path.join(backendDir, 'composer.json'),
    JSON.stringify(composerJson, null, 2)
  );

  writeFileWithLog(
    path.join(backendDir, 'README.md'),
    `# ${applicationName}-backend\n\nDescribe your ${fullAppName} backend.`
  );

  // ===========================
  // FRONTEND
  // ===========================
  const frontendDir = path.join(baseDir, `${applicationName}-frontend`);
  createDirIfNotExists(frontendDir);

  const frontendSrcDir = path.join(frontendDir, 'src');
  createDirIfNotExists(frontendSrcDir);

  // package.json
  const frontendPackageJson = {
    name: `@${organizationName}/${applicationName}-frontend`,
    version: "1.0.0",
    description: "Describe your package",
    main: "dist/index.js",
    scripts: {
      build: "rm -rf dist && tsc"
    },
    author: `${userName} <${userEmail}>`,
    license: "MIT",
    dependencies: {
      "@clarion-app/types": "^1.6.0",
      "@reduxjs/toolkit": "^1.9.5",
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "react-redux": "^8.0.5",
      "react-router-dom": "^6.4.1",
      "typescript": "^4.8.4"
    },
    devDependencies: {
      "@types/react": "^18.0.21",
      "@types/react-dom": "^18.0.6"
    },
    customFields: {
      clarion: {
        api: [camelAppApiName],  // e.g. "testAppApi"
        routes: [
          {
            path: `/${organizationName}/${applicationName}/messages`,
            element: "<Messages />"
          },
          {
            path: `/${organizationName}/${applicationName}/messages/:id`,
            element: "<Message />"
          }
        ],
        menu: {
          name: pascalCaseAppName + " Application",
          entries: [
            {
              name: "Messages",
              path: `/${organizationName}/${applicationName}/messages`
            }
          ]
        }
      }
    }
  };
  writeFileWithLog(
    path.join(frontendDir, 'package.json'),
    JSON.stringify(frontendPackageJson, null, 2)
  );

  // tsconfig.json
  const frontendTsConfig = {
    compilerOptions: {
      module: "esnext",
      jsx: "react-jsx",
      esModuleInterop: true,
      target: "es6",
      moduleResolution: "node",
      sourceMap: true,
      outDir: "dist",
      declaration: true,
      lib: ["es2017", "dom"],
      resolveJsonModule: true,
      allowJs: true,
      skipLibCheck: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      forceConsistentCasingInFileNames: true,
      noFallthroughCasesInSwitch: true,
      isolatedModules: true
    },
    include: ["./src/**/*"]
  };
  writeFileWithLog(
    path.join(frontendDir, 'tsconfig.json'),
    JSON.stringify(frontendTsConfig, null, 2)
  );

  // index.ts
  const frontendIndexTs = `import { BackendType } from "@clarion-app/types";
import { ${camelAppApiName} } from "./${camelAppApiName}";
import { Message } from "./Message";
import { Messages } from "./Messages";

export const backend: BackendType = { url: "http://localhost:8000", token: "", user: { id: "", name: "", email: ""} };

export const updateFrontend = (config: BackendType) => {
    backend.url = config.url;
    backend.token = config.token;
    backend.user = config.user;
};

export {
    ${camelAppApiName},
    Message,
    Messages,
};
`;
  writeFileWithLog(
    path.join(frontendSrcDir, 'index.ts'),
    frontendIndexTs
  );

  // baseQuery.ts
  const baseQueryTs = `import { BaseQueryFn, FetchArgs, fetchBaseQuery, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { backend } from '.';

const rawBaseQuery = (baseUrl: string) => fetchBaseQuery({ 
    baseUrl: baseUrl,
    prepareHeaders: (headers) => {
        headers.set('Content-Type', 'application/json');
        headers.set('Authorization', 'Bearer ' + backend.token);
        return headers;
    }
});

const routePrefix = '/api/${organizationName}/${applicationName}';
  
export default function baseQuery(): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> {
    return async (args, api, extraOptions) => {
        let result = await rawBaseQuery(backend.url + routePrefix)(args, api, extraOptions);
        return result;
    };
}
`;
  writeFileWithLog(
    path.join(frontendSrcDir, 'baseQuery.ts'),
    baseQueryTs
  );

  // The "Api" file => e.g. "testAppApi.ts"
  const appNameApiTs = `import { createApi } from '@reduxjs/toolkit/query/react';
import baseQuery from './baseQuery';
import { LaravelModelType } from '@clarion-app/types';

export interface MessageType extends LaravelModelType {
  to: string;
  from: string;
  message: string;
}

export const ${camelAppApiName} = createApi({
  reducerPath: '${organizationName}-${applicationName}-api',
  baseQuery: baseQuery(),
  tagTypes: ['Message'],
  endpoints: (builder) => ({
    getMessages: builder.query<MessageType[], void>({
      query: () => '/messages',
      providesTags: ['Message'],
    }),
    getMessage: builder.query<MessageType, string>({
      query: (id) => \`/messages/\${id}\`,
      providesTags: ['Message'],
    }),
    createMessage: builder.mutation<MessageType, Partial<MessageType>>({
      query: (message) => ({
        url: '/messages',
        method: 'POST',
        body: message,
      }),
      invalidatesTags: ['Message'],
    }),
    updateMessage: builder.mutation<MessageType, { id: string; message: Partial<MessageType> }>({
      query: ({ id, message }) => ({
        url: \`/messages/\${id}\`,
        method: 'PUT',
        body: message,
      }),
      invalidatesTags: ['Message'],
    }),
    deleteMessage: builder.mutation<void, string>({
      query: (id) => ({
        url: \`/messages/\${id}\`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Message'],
    }),
  }),
});

// Extract hooks
export const {
  useGetMessagesQuery,
  useGetMessageQuery,
  useCreateMessageMutation,
  useUpdateMessageMutation,
  useDeleteMessageMutation,
} = ${camelAppApiName};
`;
  writeFileWithLog(path.join(frontendSrcDir, apiFileName), appNameApiTs);

  // Message.tsx
  const messageTsx = `import React from 'react';
import { MessageType } from './${camelAppApiName}';

interface MessageProps {
  message: MessageType;
}

export const Message = ({ message }: MessageProps) => {
  return (
    <div>
      <h2>Message from: {message.from}</h2>
      <p><strong>To:</strong> {message.to}</p>
      <p>{message.message}</p>
    </div>
  );
};
`;
  writeFileWithLog(
    path.join(frontendSrcDir, 'Message.tsx'),
    messageTsx
  );

  // Messages.tsx
  const messagesTsx = `import React from 'react';
import { useGetMessagesQuery, MessageType } from './${camelAppApiName}';

export const Messages = () => {
  const { data: messages, isLoading, error } = useGetMessagesQuery();

  if (isLoading) {
    return <div>Loading messages...</div>;
  }

  if (error) {
    return <div>Error fetching messages.</div>;
  }

  return (
    <div>
      <h1>Messages</h1>
      {messages?.map((msg: MessageType) => (
        <div key={msg.id}>
          <h3>From: {msg.from}</h3>
          <p>{msg.message}</p>
          <p><strong>To:</strong> {msg.to}</p>
        </div>
      ))}
    </div>
  );
};
`;
  writeFileWithLog(
    path.join(frontendSrcDir, 'Messages.tsx'),
    messagesTsx
  );

  console.log(`\nOkily-dokily! Your Clarion boilerplate for ${fullAppName} is ready at: ${baseDir}\n`);
}

// ============================
// Helper Functions
// ============================
function createDirIfNotExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFileWithLog(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Created: ${filePath}`);
}

/**
 * "test-app" -> "TestApp"
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(
      part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * "test-app" -> "testAppApi"
 */
function toCamelCasePlusApi(str: string): string {
  const parts = str.split('-');
  const [first, ...rest] = parts;
  const camel = [
    first.toLowerCase(),
    ...rest.map(
      p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    )
  ].join('');
  return camel + 'Api';
}

main().catch(err => {
  console.error('Whoopsie-daisy! Something went wrong:', err);
  process.exit(1);
});

