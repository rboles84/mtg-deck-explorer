/** A bounded view over the independent Clipboard; never changes stored entries. */
export function clipboardPageView(items, query = '', page = 1, size = 12) {
  const normalized=String(query).trim().toLocaleLowerCase('en');
  const filtered=items.filter(item=>`${item.name} ${item.set} ${item.collectorNumber}`.toLocaleLowerCase('en').includes(normalized));
  const pageSize=Number.isInteger(size)&&size>0?size:12;
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const current=Math.min(pages,Math.max(1,Number.isInteger(page)?page:1));
  return {items:filtered.slice((current-1)*pageSize,current*pageSize),page:current,pages,total:filtered.length};
}
