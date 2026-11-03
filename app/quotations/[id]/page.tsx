import { QuoteDetail } from '@/components/commercial'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <QuoteDetail id={id}/>}
