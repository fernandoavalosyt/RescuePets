const service = require('./posts.service');
const { parseId } = require('../../shared/http');

const postId = (req) => parseId(req.params.id, 'Publicación');

const list = (req, res) => res.json(service.listFeed(req.query, req.user));
const mine = (req, res) => res.json(service.listMine(req.query, req.user));
const get = (req, res) => res.json({ post: service.get(postId(req), req.user) });
const update = (req, res) => res.json({ post: service.update(postId(req), req.user, req.body) });

function remove(req, res) {
  service.remove(postId(req), req.user);
  res.json({ message: 'Publicación eliminada.' });
}

async function addImages(req, res) {
  res.status(201).json({ post: await service.addImages(postId(req), req.user, req.files) });
}

async function removeImage(req, res) {
  const mediaId = parseId(req.params.mediaId, 'Imagen');
  res.json({ post: await service.removeImage(postId(req), mediaId, req.user) });
}

module.exports = { list, mine, get, update, remove, addImages, removeImage };
