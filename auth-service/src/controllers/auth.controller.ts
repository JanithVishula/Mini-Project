import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

// Register function to create a new user
export async function register(req: Request, res: Response) {
  const { email, password, name, role } = req.body;

  // Validate input
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password and name are required' });
    return;
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }

  // Hash the password before storing it
  const hashedPassword = await bcrypt.hash(password, 10);

//  the 10 is the salt rounds. Bcrypt runs the hashing algorithm 
//  2^10 = 1024 times deliberately.
//  This makes brute-force attacks slow — even if someone steals your database, 
//  cracking each password takes significant time


  // Create the new user in the database
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name, role: role ?? 'CUSTOMER' }
  });

  // Return the created user information (excluding password)
  res.status(201).json({
    message: 'User created successfully',
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  });
}

// HTTP 201 means "Created". 200 means "OK". 
// When you create a new resource, 201 is the correct status code.


// Login function to authenticate users and generate JWT token
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  // Check if user exists
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Compare provided password with stored hashed password
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

// Why both cases return "Invalid credentials" instead of "User not found" 
// or "Wrong password" separately? Security. 
// If you say "user not found", attackers know which emails are registered. 
// Keeping it vague reveals nothing.

  
  // If password matches, generate JWT token
 const token = jwt.sign(
  { userId: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET!,
  { expiresIn: '7d' }
);

  // Return the token and user information
  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  });
}