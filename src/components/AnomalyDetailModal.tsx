import { memo } from 'react';
import { Button, Descriptions, Modal, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { AnomalyRecord } from '../api/hooks';
import {
  anomalyPatternColor,
  anomalyPatternLabel,
  anomalySeverityLabel,
  formatAnomalyDeviation,
  inferAnomalyCause,
  inferAnomalyPattern,
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

function AnomalyDetailModal({ anomaly, open, onClose }: AnomalyDetailModalProps) {
  const navigate = useNavigate();

  return (
    <Modal
      title="Аномалия потребления"
      open={open}
      destroyOnClose={false}
      maskClosable
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Закрыть
        </Button>,
        <Button
          key="journal"
          type="primary"
          onClick={() => {
            onClose();
            navigate('/anomalies');
          }}
        >
          Журнал аномалий
        </Button>,
      ]}
      width={480}
      zIndex={1100}
      className="anomaly-detail-modal"
    >
      {anomaly && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Tag color={anomalyPatternColor(inferAnomalyPattern(anomaly))}>
              {anomalyPatternLabel(inferAnomalyPattern(anomaly))}
            </Tag>
          </div>
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
              {(() => {
                const deviation = formatAnomalyDeviation(anomaly);
                return deviation.color ? (
                  <Text style={{ color: deviation.color, fontWeight: 600 }}>{deviation.text}</Text>
                ) : (
                  deviation.text
                );
              })()}
            </Descriptions.Item>
          </Descriptions>

          <Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
            <Text strong>Возможная причина</Text>
            <br />
            <Text type="secondary">{inferAnomalyCause(anomaly)}</Text>
          </Paragraph>
        </>
      )}
    </Modal>
  );
}

export default memo(AnomalyDetailModal);
