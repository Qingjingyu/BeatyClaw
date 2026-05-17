import Router from '@koa/router'
import * as ctrl from '../../controllers/agentic/employees'

export const employeeRoutes = new Router()

employeeRoutes.get('/api/employees', ctrl.list)
employeeRoutes.post('/api/employees', ctrl.create)
employeeRoutes.get('/api/employees/current', ctrl.current)
employeeRoutes.get('/api/employees/:id', ctrl.detail)
employeeRoutes.patch('/api/employees/:id', ctrl.update)
employeeRoutes.post('/api/employees/:id/deploy', ctrl.deploy)
employeeRoutes.post('/api/employees/:id/start', ctrl.start)
employeeRoutes.post('/api/employees/:id/stop', ctrl.stop)
employeeRoutes.post('/api/employees/:id/select', ctrl.select)
