import { EntityScreen, customers } from '@/components/admin-screens'
export default function Customers(){return <EntityScreen title="Customers" crumb="Customers" singular="Customer" rows={customers} columns={['Customer','Contact','Commercial','Status']} helper="Manage commercial customers and their portal eligibility."/>}
