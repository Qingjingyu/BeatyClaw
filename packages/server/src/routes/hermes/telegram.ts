import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/telegram'

export const telegramRoutes = new Router()

telegramRoutes.get('/api/hermes/telegram/status', ctrl.status)
