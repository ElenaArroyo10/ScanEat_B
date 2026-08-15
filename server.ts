import app from './src/app';
import env from './env';
import authRoutes from './src/routes/authRoutes';

app.use('/api/auth', authRoutes);



app.use('/api', (req, res) =>{
    res.status(404).json({ message: 'Endpoint not found' });
});

app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
});