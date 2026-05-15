import Router from '@koa/router'
import * as ctrl from '../../controllers/agentic/hxa'

export const agenticHxaRoutes = new Router()

agenticHxaRoutes.get('/api/agentic/hxa/overview', ctrl.overview)
