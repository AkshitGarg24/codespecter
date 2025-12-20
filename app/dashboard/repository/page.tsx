import { getRepositoriesAction } from "@/modules/repositories/action"; 
import RepositoryList from "@/modules/repositories/components/repository-list";

export default async function ImportPage() {
  const firstPageData = await getRepositoriesAction(null);
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Import Repositories</h1>
      <RepositoryList initialData={firstPageData} />
    </div>
  );
}