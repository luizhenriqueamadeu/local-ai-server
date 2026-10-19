/**
 * User Store
 * Server-side users (name + avatar) and per-user conversation storage.
 * Lets different people/departments use the web chat over the network
 * without mixing their conversations. Data lives in <project>/data/
 * (never committed to git).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');
const usersPath = join(dataDir, 'users.json');
const convsDir = join(dataDir, 'conversations');
const projectsDir = join(dataDir, 'projects');

function ensureDirs() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(convsDir)) mkdirSync(convsDir, { recursive: true });
  if (!existsSync(projectsDir)) mkdirSync(projectsDir, { recursive: true });
}

const AVATAR_MAX_CHARS = 300000; // ~220KB data URL
const MAX_CONVERSATIONS = 100;

const COLORS = ['#8a7ffc', '#3fb950', '#f78166', '#4cc9f0', '#f72585', '#ffd166', '#06d6a0', '#b388ff', '#ff8fa3', '#7dd3fc'];

function colorFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

const safeId = (id) => /^[a-z0-9_]{1,40}$/i.test(String(id || ''));

// ---------------- Users ----------------

export function getUsers() {
  ensureDirs();
  try {
    return JSON.parse(readFileSync(usersPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveUsers(list) {
  ensureDirs();
  writeFileSync(usersPath, JSON.stringify(list, null, 2));
}

export function addUser({ name, avatar } = {}) {
  const cleanName = String(name || '').trim().slice(0, 40);
  if (!cleanName) throw new Error('Nome é obrigatório');
  if (avatar && String(avatar).length > AVATAR_MAX_CHARS) throw new Error('Imagem muito grande (máx ~200KB)');

  ensureDirs();
  const list = getUsers();
  if (list.some(u => u.name.toLowerCase() === cleanName.toLowerCase())) {
    throw new Error(`Já existe um usuário "${cleanName}"`);
  }
  const user = {
    id: 'u_' + randomUUID().replace(/-/g, '').slice(0, 12),
    name: cleanName,
    avatar: avatar ? String(avatar) : '',
    color: colorFor(cleanName),
    createdAt: new Date().toISOString(),
  };
  list.push(user);
  saveUsers(list);
  return user;
}

export function updateUser(id, { name, avatar } = {}) {
  if (!safeId(id)) throw new Error('id inválido');
  const list = getUsers();
  const user = list.find(u => u.id === id);
  if (!user) throw new Error('Usuário não encontrado');
  if (name != null) {
    const cleanName = String(name).trim().slice(0, 40);
    if (cleanName) user.name = cleanName;
  }
  if (avatar !== undefined) {
    if (avatar && String(avatar).length > AVATAR_MAX_CHARS) throw new Error('Imagem muito grande (máx ~200KB)');
    user.avatar = avatar ? String(avatar) : '';
  }
  saveUsers(list);
  return user;
}

export function removeUser(id) {
  if (!safeId(id)) throw new Error('id inválido');
  saveUsers(getUsers().filter(u => u.id !== id));
  try { unlinkSync(join(convsDir, `${id}.json`)); } catch { /* no conversations */ }
  return true;
}

// ---------------- Conversations (per user) ----------------

export function listConversations(userId) {
  if (!safeId(userId)) return [];
  ensureDirs();
  try {
    return JSON.parse(readFileSync(join(convsDir, `${userId}.json`), 'utf8'));
  } catch {
    return [];
  }
}

export function saveConversation(userId, conv) {
  if (!safeId(userId)) throw new Error('userId inválido');
  if (!conv || !safeId(conv.id)) throw new Error('conversation id inválido');
  ensureDirs();
  const path = join(convsDir, `${userId}.json`);
  let list = [];
  try { list = JSON.parse(readFileSync(path, 'utf8')); } catch { /* new */ }
  const index = list.findIndex(c => c.id === conv.id);
  if (index >= 0) list[index] = conv;
  else list.unshift(conv);
  writeFileSync(path, JSON.stringify(list.slice(0, MAX_CONVERSATIONS), null, 0));
  return true;
}

export function deleteConversation(userId, convId) {
  if (!safeId(userId) || !safeId(convId)) throw new Error('id inválido');
  ensureDirs();
  const list = listConversations(userId).filter(c => c.id !== convId);
  writeFileSync(join(convsDir, `${userId}.json`), JSON.stringify(list));
  return true;
}

// ---------------- Projects (per user) ----------------

export function listProjects(userId) {
  if (!safeId(userId)) return [];
  ensureDirs();
  try {
    return JSON.parse(readFileSync(join(projectsDir, `${userId}.json`), 'utf8'));
  } catch {
    return [];
  }
}

function saveProjects(userId, list) {
  if (!safeId(userId)) throw new Error('userId inválido');
  ensureDirs();
  writeFileSync(join(projectsDir, `${userId}.json`), JSON.stringify(list, null, 2));
}

export function addProject(userId, { name, color } = {}) {
  const cleanName = String(name || '').trim().slice(0, 50);
  if (!cleanName) throw new Error('Nome do projeto é obrigatório');
  const list = listProjects(userId);
  if (list.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
    throw new Error(`Já existe um projeto "${cleanName}"`);
  }
  const project = {
    id: 'p_' + randomUUID().replace(/-/g, '').slice(0, 10),
    name: cleanName,
    color: color || colorFor(cleanName),
    createdAt: new Date().toISOString(),
  };
  list.push(project);
  saveProjects(userId, list);
  return project;
}

export function updateProject(userId, id, { name, color } = {}) {
  if (!safeId(userId)) throw new Error('userId inválido');
  const list = listProjects(userId);
  const project = list.find(p => p.id === id);
  if (!project) throw new Error('Projeto não encontrado');
  if (name != null) {
    const cleanName = String(name).trim().slice(0, 50);
    if (cleanName) project.name = cleanName;
  }
  if (typeof color === 'string' && color) project.color = color;
  saveProjects(userId, list);
  return project;
}

export function removeProject(userId, id) {
  if (!safeId(userId)) throw new Error('userId inválido');
  saveProjects(userId, listProjects(userId).filter(p => p.id !== id));
  return true;
}
