const categories = ['Электроэнергия', 'Водоснабжение', 'Газоснабжение', 'Отопление'];
const startDate = new Date();
startDate.setDate(startDate.getDate() - 7);

const consumptionData = [];

for (let i = 0; i < 7 * 24; i++) {
  const date = new Date(startDate.getTime() + i * 60 * 60 * 1000);
  const dataPoint = {
    time: date.toISOString(),
    'Электроэнергия': Math.floor(Math.random() * 100) + 50,
    'Водоснабжение': Math.floor(Math.random() * 20) + 10,
    'Газоснабжение': Math.floor(Math.random() * 30) + 20,
    'Отопление': Math.floor(Math.random() * 80) + 40,
  };
  consumptionData.push(dataPoint);
}

export const mockConsumptionData = consumptionData;
export const consumptionCategories = categories;
