// Helper function for pagination
const handlePagination = (page: any, limit: any) => {
  const validPage = Math.max(1, Number(page) || 1);
  const validLimit = Math.min(100, Math.max(1, Number(limit) || 10));
  return { page: validPage, limit: validLimit };
};

// Helper function for pagination response
const getPaginationData = (page: number, limit: number, total: number) => {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    currentPage: page,
    totalPages,
    limit,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};

export { handlePagination, getPaginationData };
