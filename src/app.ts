import cors from 'cors';
import express, { Application } from 'express';
import path from 'path';

import morgan from 'morgan';
import helmet from 'helmet';

const app: Application = express();

app.use(cors());
app.use(helmet());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(morgan('dev', {
    skip: () => process.env.NODE_ENV === 'test'
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

export default app;