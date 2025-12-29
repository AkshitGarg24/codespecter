import { getRepositoriesAction } from '@/modules/repositories/action';
import RepositoryList from '@/modules/repositories/components/repository-list';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Repositories - CodeSpecter',
  description: 'An intelligent automation bot that provides instant, contextual feedback on GitHub Pull Requests.',
};

export default async function ImportPage() {
  const firstPageData = await getRepositoriesAction(null);
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Import Repositories</h1>
      <RepositoryList initialData={firstPageData} />
    </div>
  );
}
