import { Button, Descriptions, Modal, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { AnomalyRecord } from '../api/hooks';
import {
  anomalySeverityLabel,
  formatAnomalyDeviation,
  inferAnomalyCause,
} from '../utils/anomalyUtils';

const { Paragraph, Text } = Typography;

const SEVERITY_TAG: Record<string, string> = {
  low: 'green',
  medium: 'gold',
  high: 'orange',
  critical: 'red',
};

interface AnomalyDetailModalProps {
  anomaly: AnomalyRecord | null;
  open: boolean;
  onClose: () => void;
}

export default function AnomalyDetailModal({ anomaly, open, onClose }: AnomalyDetailModalProps) {
  if (!anomaly) return null;

  const deviation = formatAnomalyDeviation(anomaly);
  const cause = inferAnomalyCause(anomaly);

  return (
    <Modal
      title="Аномалия потребления"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Закрыть
        </Button>,
        <Link key="journal" to="/anomalies" onClick={onClose}>
          <Button type="primary">Журнал аномалий</Button>
        </Link>,
      ]}
      width={480}
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Время">
          {new Date(anomaly.time).toLocaleString('ru-RU')}
        </Descriptions.Item>
        <Descriptions.Item label="Сенсор">
          {anomaly.sensor_label ?? anomaly.category}
        </Descriptions.Item>
        <Descriptions.Item label="Категория">{anomaly.category}</Descriptions.Item>
        <Descriptions.Item label="Уровень">
          <Tag color={SEVERITY_TAG[anomaly.severity] ?? 'default'}>
            {anomalySeverityLabel(anomaly.severity)}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Факт">
          {anomaly.value.toFixed(1)} Вт
        </Descriptions.Item>
        <Descriptions.Item label="Норма">
          {anomaly.expected != null ? `${anomaly.expected.toFixed(1)} Вт` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Отклонение">
          {deviation.color ? (
            <Text style={{ color: deviation.color, fontWeight: 600 }}>{deviation.text}</Text>
          ) : (
            deviation.text
          )}
        </Descriptions.Item>
      </Descriptions>

      <Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
        <Text strong>Возможная причина</Text>
        <br />
        <Text type="secondary">{cause}</Text>
      </Paragraph>
    </Modal>
  );
}
